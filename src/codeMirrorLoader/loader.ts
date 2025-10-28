import { EditorView, KeyBinding, keymap } from "@codemirror/view";
import { Compartment, EditorState, Extension, Prec } from "@codemirror/state";
import { openSearchPanel } from "@codemirror/search";
import { vscodeKeymap } from "@replit/codemirror-vscode-keymap";
import { autocompletion, closeBrackets, CompletionContext} from "@codemirror/autocomplete";
import { html } from "@codemirror/lang-html";
import { javascript, javascriptLanguage } from "@codemirror/lang-javascript";
import { sql } from "@codemirror/lang-sql";
import { bracketMatching, language } from "@codemirror/language";
import {EditorCompletions} from "./editorCompletions";
import PluginEnhanceEditor from "../index";
import {githubLight} from "@ddietr/codemirror-themes/github-light";
import {githubDark} from "@ddietr/codemirror-themes/github-dark";
import { isDev } from "../utils/constants";
import { history, redo, undo } from "@codemirror/commands";
import { createLogger, ILogger } from "../utils/simple-logger";
import * as prettier from "prettier";
import * as prettierPluginLatex from "prettier-plugin-latex";

export class EditorLoader {
    private logger: ILogger;
    private ref_textarea_handle:() => void;
    private mouse_down_handle: (e:MouseEvent) => void;
    private container_handle: (e:Event) => void;

    constructor(private plugin: PluginEnhanceEditor){
        this.logger = createLogger("Codemirror Loader");
    }

    public async loadCodeMirror(root: HTMLElement, data_type: string) {
        // Determine the block type to render
        const type = this.detectRenderType(data_type);
        // Exit early if it's an unsupported/unknown block
        if (type === "unknown") return;

        // Get user settings from SiYuan
        const userConfig = (window as unknown as {siyuan: any}).siyuan.config;
        // Appearance: 0 = light, 1 = dark
        const mode  = userConfig.appearance.mode;
        // Read keymap from SiYuan
        const keymapList = userConfig.keymap;
        if (isDev) this.logger.info("Fetched SiYuan keymap list =>", keymapList);

        const ref_textarea = root.querySelector("textarea");
        const container = document.createElement("div");
        container.setAttribute("class", "b3-text-field--text");
        container.setAttribute("id", "editorEnhanceContainer");
        container.setAttribute("style", "width:100%;max-height: calc(-44px + 80vh); min-height: 48px; min-width: 268px; border-radius: 0 0 var(--b3-border-radius-b) var(--b3-border-radius-b); font-family: var(--b3-font-family-code);position:relative");
        ref_textarea.parentNode.insertBefore(container, ref_textarea);
        ref_textarea.style.display = "none";

        // Format mode selector (top-right of the editor)
        const fmtSelect = document.createElement("select");
        fmtSelect.setAttribute("style", "position:absolute;top:6px;right:8px;z-index:2;font-size:12px;padding:2px;background:var(--b3-theme-background);border:1px solid var(--b3-theme-surface-lighter);border-radius:4px;color:var(--b3-theme-on-surface)");
        const modes: Array<{value: "off"|"gentle"|"original", label: string}> = [
            { value: "off", label: "Off" },
            { value: "gentle", label: "Gentle" },
            { value: "original", label: "Original" },
        ];
    const currentMode = (this.plugin.data as any)["menu-config"]?.formattingMode ?? "off";
    container.dataset.formattingMode = currentMode;
        for (const m of modes) {
            const opt = document.createElement("option");
            opt.value = m.value;
            opt.textContent = m.label;
            if (m.value === currentMode) opt.selected = true;
            fmtSelect.appendChild(opt);
        }
        fmtSelect.title = "Format: Off/Gentle/Original (toggle)";
        container.appendChild(fmtSelect);
        fmtSelect.addEventListener("change", async () => {
            const modeVal = (fmtSelect.value as "off"|"gentle"|"original");
            container.dataset.formattingMode = modeVal;
            (this.plugin.data as any)["menu-config"].formattingMode = modeVal;
            if (typeof (this.plugin as any).saveData === "function") {
                await (this.plugin as any).saveData("menu-config");
            }
            if (isDev) this.logger.info("Formatting mode switched to", modeVal);
        });

        // Resizable handle (bottom-right)
        const dragHandle = document.createElement("div");
        // container.setAttribute("style", ref_textarea.style.cssText);
        dragHandle.setAttribute("style", "width: 0px; height: 0px; border-bottom:1em solid grey;border-left:1em solid transparent;position:absolute;bottom: 0;right: 0;cursor: nwse-resize;z-index:1");
        container.appendChild(dragHandle);

        // Internal theme/styles for the embedded editor
        const editorTheme = EditorView.theme({
            "&.cm-focused": {
                outline: "none"
            },
            ".cm-line": {
                "font-family": "var(--b3-font-family-code)"
            },
            ".cm-scroller": {
                "overflow": "scroll",
                "max-height": "calc(-44px + 80vh)", 
                "min-height": "48px", 
                "min-width": "268px"
            },
            "&.cm-editor": {
                "background-color": "transparent"
            },
            ".cm-nonmatchingBracket": {
                "background-color": "#bb555544 !important"
            },
            ".cm-tooltips-autocomplete": {
                "z-index": 2
            }
        });

        // Keymap pass-through and overrides
        const keybinds:KeyBinding[] = [
            {
                key: "Mod-f", run: openSearchPanel, scope: "editor search-panel",stopPropagation:true, preventDefault: true
            },
            {
                key: "Mod-z", run: undo, scope: "editor", preventDefault: true,
                stopPropagation: true
            },
            {
                key: "Mod-y", run: redo, scope: "editor", preventDefault: true,stopPropagation: true
            },
            {
                key: "Mod-Enter", 
                run: () => {
                    ref_textarea.dispatchEvent(new KeyboardEvent("keydown", {
                        key: "Enter",
                        keyCode: 13,
                        ctrlKey: true
                    }));
                    return true;
                },
                shift: () => {
                    ref_textarea.dispatchEvent(new KeyboardEvent("keydown", {
                        key: "Enter",
                        keyCode: 13,
                        ctrlKey: true,
                        shiftKey: true
                    }));
                    return true;
                },stopPropagation:true, preventDefault: true
            },
            {
                key: "Escape",
                run: () => {
                    console.log("ESC");
                    ref_textarea.dispatchEvent(new KeyboardEvent("keydown", {
                        key: "Escape",
                        keyCode: 27
                    }));
                    return true;
                },stopPropagation:true, preventDefault: true
            }
        ];

        let startState = null;
    switch (type) {
            case "math":
        startState = await this.generateStateMath(ref_textarea, keybinds, editorTheme, mode, container);
                break;
            case "sql/js":
                startState = await this.generateStateSQLJS(ref_textarea, keybinds, editorTheme, mode);
                break;
            case "html":
                startState = await this.generateStateHTML(ref_textarea, keybinds, editorTheme, mode);
                break;
            default:
                startState = null;
                break;
        }

    // Safety check: don't render if we couldn't build a state
        if (!startState) return; 
            
        const view = new EditorView({
            state:startState,
            parent: container
        });

        // Prevent keydown bubbling from container
        this.container_handle = (e) => {
            e.stopPropagation();
        };
        container.addEventListener("keydown", this.container_handle);
        // Keep syncing from CodeMirror to the original textarea (for compatibility)
        this.ref_textarea_handle = () => {
            if (view.state.doc.toString() == ref_textarea.value) {
                return;
            }
            view.dispatch({
                changes: {
                    from: 0,
                    to: view.state.doc.length,
                    insert: ref_textarea.value
                }
            });
        };
        // To avoid external formatters (plugins or SiYuan built-ins) forcing LaTeX formatting on input,
        // in math mode we disable reverse sync (textarea -> CodeMirror) and keep a single direction
        // (CodeMirror -> textarea) to preserve user newlines and braces as-is.
        const isMath = type === "math";
        if (!isMath) {
            ref_textarea.addEventListener("input", this.ref_textarea_handle);
        }
        this.mouse_down_handle = (e:MouseEvent) => {
            e.preventDefault();
            const scroll = container.querySelector(".cm-scroller") as HTMLElement;
            console.log(scroll);
            let isResizing = true;
            let lastX = e.clientX;
            let lastY = e.clientY;
            const handleMouseMove = (move_ev:MouseEvent) => {
                if (!isResizing) return;
        
                const deltaX = move_ev.clientX - lastX;
                const deltaY = move_ev.clientY - lastY;
        
                const newWidth = container.offsetWidth + deltaX;
                const newHeight = scroll.offsetHeight + deltaY;
        
                container.style.width = `${newWidth}px`;
                scroll.style.height = `${newHeight}px`;
        
                lastX = move_ev.clientX;
                lastY = move_ev.clientY;
            };
            const handleMouseUp = () => {
                isResizing = false;
                window.removeEventListener("mousemove", handleMouseMove);
                window.removeEventListener("mouseup", handleMouseUp);
            };
            window.addEventListener("mousemove", handleMouseMove);
            window.addEventListener("mouseup", handleMouseUp);
        };
        dragHandle.addEventListener("mousedown", this.mouse_down_handle);
        view.focus();
        view.dispatch({
            selection: {
                anchor: 0,
                head: view.state.doc.length
            }
        });
    }

    private async generateStateMath(
        ref_textarea:HTMLTextAreaElement,
        keybinds: KeyBinding[],
        editorTheme: Extension,
        mode:any,
        container: HTMLElement
    ): Promise<EditorState> {
        // Load completions on demand
        const editorCompletions = new EditorCompletions(this.plugin);
        const completionList = await editorCompletions.get();

        function mathCompletions(context: CompletionContext) {
            const word = context.matchBefore(/(\\[\w\{\}]*)/);
            if (!word || (word.from == word.to && !context.explicit))
                return null;
            else if (word.text.indexOf("{") != -1) {
                return {
                    from: word.from,
                    to: word.to + 1,
                    options: completionList
                };
            }
            return {
                from: word.from,
                options: completionList
            };
        }

        const cfg = (this.plugin.data as any)["menu-config"] ?? { formattingMode: "off" };
        const formattingMode = cfg.formattingMode as ("off"|"gentle"|"original");

        // Auto-format on open only when using "original" mode
        const docValue = formattingMode === "original" ?
            (await prettier.format("$" + ref_textarea.value + "$", {
                printWidth: 80,
                useTabs: true,
                tabWidth: 2,
                parser: "latex-parser",
                plugins: [prettierPluginLatex]
            })).slice(1,-1) :
            ref_textarea.value;

        // "Gentle" formatting: normalize newlines and trim trailing spaces only
        const gentleRun = (view: EditorView) => {
            try {
                const src = view.state.doc.toString();
                const formatted = this.gentleFormatLatex(src);
                if (formatted !== src) {
                    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: formatted } });
                }
            } catch (e) {
                if (isDev) this.logger.warn("Manual format failed", e);
            }
            return true;
        };
        // "Original" formatting: use Prettier latex-parser
        const prettierRun = (view: EditorView) => {
            (async () => {
                try {
                    const src = view.state.doc.toString();
                    const out = await prettier.format("$" + src + "$", {
                        printWidth: 80,
                        useTabs: true,
                        tabWidth: 2,
                        parser: "latex-parser",
                        plugins: [prettierPluginLatex]
                    });
                    const formatted = out.slice(1,-1);
                    if (formatted !== src) {
                        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: formatted } });
                    }
                } catch (e) {
                    if (isDev) this.logger.warn("Manual format failed", e);
                }
            })();
            return true;
        };
        // "Off" formatting: do nothing on hotkey
        const noopRun = (_view: EditorView) => true;

        // Tiny overlay toast
        const flash = (text: string) => {
            const tip = document.createElement("div");
            tip.textContent = text;
            tip.setAttribute("style", "position:absolute;top:6px;right:52px;z-index:3;padding:2px 6px;border-radius:4px;background:var(--b3-theme-surface);color:var(--b3-theme-on-surface);border:1px solid var(--b3-theme-surface-lighter);font-size:12px;opacity:0.95;pointer-events:none");
            container.appendChild(tip);
            setTimeout(() => tip.remove(), 1000);
        };

        // Read mode dynamically so the hotkey reflects the latest dropdown state
        const dynamicRun = (view: EditorView) => {
            const cur = ((container.dataset.formattingMode as any) ?? (this.plugin.data as any)["menu-config"]?.formattingMode ?? "off") as "off"|"gentle"|"original";
            if (cur === "original") { const r = prettierRun(view); flash("Format: Original"); return r; }
            if (cur === "gentle") { const r = gentleRun(view); flash("Format: Gentle"); return r; }
            flash("Format: Off");
            return true; // off
        };
        // Avoid common system conflicts: use Alt-Shift-F only
        const formatCommandAlt: KeyBinding = { key: "Alt-Shift-f", run: dynamicRun, preventDefault: true, stopPropagation: true };
        const formatKeymap = Prec.high(keymap.of([formatCommandAlt]));

        const startState = EditorState.create({
            doc: docValue,
            extensions: [
                // For math mode: enable closeBrackets only in "original" mode to match legacy behavior
                keymap.of([...keybinds, ...vscodeKeymap]),
                formatKeymap,
                EditorView.lineWrapping,
                EditorView.updateListener.of((e) => {
                    // Sync editor content to the original textarea and dispatch input
                    const sync_val = e.state.doc.toString();
                    // Avoid loops when content is the same
                    if (ref_textarea.value === sync_val) {
                        return;
                    }
                    ref_textarea.value = sync_val;
                    ref_textarea.dispatchEvent(new Event("input", {
                        bubbles: true,
                        cancelable: true
                    }));
                }),
                autocompletion({
                    defaultKeymap: false,
                    override: [mathCompletions]
                }),
                ...(formattingMode === "original" ? [closeBrackets()] : []),
                bracketMatching(),
                editorTheme,
                mode ? githubDark: githubLight,
                history()
                
            ]
        });
        return startState;
    }

    // Gentle LaTeX formatting only:
    // - Normalize line endings to \n
    // - Trim trailing whitespace per line
    // - Preserve user line structure and braces, no reflow/rewrites
    private gentleFormatLatex(src: string): string {
        const normalized = src.replace(/\r\n?|\n/g, "\n");
        const lines = normalized.split("\n");
        const out = lines.map(l => l.replace(/\s+$/, ""));
        return out.join("\n");
    }

    private async generateStateSQLJS(
        ref_textarea:HTMLTextAreaElement,
        keybinds: KeyBinding[],
        editorTheme: Extension,
        mode:any
    ): Promise<EditorState> {
        const languageConf = new Compartment;
        const docIsJs = /\/\/!js/.test(ref_textarea.value.slice(0, 20));

        const autoLanguage = EditorState.transactionExtender.of(tr => {
            if (!tr.docChanged) return null;
            const docIsJs = /\/\/!js/.test(tr.newDoc.sliceString(0, 20));
            const stateIsJs = tr.startState.facet(language) == javascriptLanguage;
            if (docIsJs == stateIsJs) return null;
            return {
                effects: languageConf.reconfigure(docIsJs ? javascript() : sql())
            };
        });

        const startState = EditorState.create({
            doc: ref_textarea.value,
            extensions: [
                keymap.of([...keybinds,...vscodeKeymap]),
                EditorView.lineWrapping,
                EditorView.updateListener.of((e) => {
                    // Sync editor content to the original textarea and dispatch input
                    const sync_val = e.state.doc.toString();
                    // Avoid loops when content is the same
                    if (ref_textarea.value === sync_val) {
                        return;
                    }
                    ref_textarea.value = sync_val;
                    ref_textarea.dispatchEvent(new Event("input", {
                        bubbles: true,
                        cancelable: true
                    }));
                }),
                languageConf.of(docIsJs ? javascript() : sql()),
                autoLanguage,
                autocompletion(),
                bracketMatching(),
                closeBrackets(),
                editorTheme,
                mode ? githubDark: githubLight,
                history()
                
            ]
        });
        return startState;
    }

    private async generateStateHTML(
        ref_textarea:HTMLTextAreaElement,
        keybinds: KeyBinding[],
        editorTheme: Extension,
        mode:any
    ): Promise<EditorState> {
        const languageConf = new Compartment;
        const startState = EditorState.create({
            doc: ref_textarea.value,
            extensions: [
                keymap.of([...keybinds,...vscodeKeymap]),
                EditorView.lineWrapping,
                EditorView.updateListener.of((e) => {
                    // Sync editor content to the original textarea and dispatch input
                    const sync_val = e.state.doc.toString();
                    // Avoid loops when content is the same
                    if (ref_textarea.value === sync_val) {
                        return;
                    }
                    ref_textarea.value = sync_val;
                    ref_textarea.dispatchEvent(new Event("input", {
                        bubbles: true,
                        cancelable: true
                    }));
                }),
                languageConf.of(html()),
                autocompletion(),
                editorTheme,
                mode ? githubDark: githubLight,
                history()
                
            ]
        });
        return startState;
    }

    private detectRenderType(data_type: string): string {
        switch (data_type) {
            case "inline-math":
                return "math";
            case "NodeMathBlock":
                return "math";
            case "NodeBlockQueryEmbed":
                return "sql/js";
            case "NodeHTMLBlock":
                return "html";
            default:
                return "unknown";
        }
    }

    private detectBlockType(protyleUtil:HTMLElement): string{
        const title = protyleUtil.querySelector(".fn__flex-1.resize__move") as HTMLElement;
        const innerText = title.innerText;
        if (innerText === (window as unknown as {siyuan: any}).siyuan.languages["inline-math"] || innerText === (window as unknown as {siyuan: any}).siyuan.languages["math"]){
            return "math";
        } else if (innerText === (window as unknown as {siyuan: any}).siyuan.languages["embedBlock"]){
            return "sql/js";
        } else if (innerText === "HTML"){
            return "html";
        } else return "unknown";
    }

}