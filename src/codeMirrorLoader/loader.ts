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
        // 判断打开的块的类型
        const type = this.detectRenderType(data_type);
        // 如果是没做好处理的“未知”块就直接退出
        if (type === "unknown") return;

        // 获取用户设置信息
        const userConfig = (window as unknown as {siyuan: any}).siyuan.config;
        // 白天黑夜模式，0是白，1是黑
        const mode  = userConfig.appearance.mode;
        // 插入快捷键获取
        const keymapList = userConfig.keymap;
        if (isDev) this.logger.info("获取到思源快捷键列表, keymap=>", keymapList);

        const ref_textarea = root.querySelector("textarea");
        const container = document.createElement("div");
        container.setAttribute("class", "b3-text-field--text");
        container.setAttribute("id", "editorEnhanceContainer");
        container.setAttribute("style", "width:100%;max-height: calc(-44px + 80vh); min-height: 48px; min-width: 268px; border-radius: 0 0 var(--b3-border-radius-b) var(--b3-border-radius-b); font-family: var(--b3-font-family-code);position:relative");
        ref_textarea.parentNode.insertBefore(container, ref_textarea);
        ref_textarea.style.display = "none";

        // 顶部右侧的格式化切换控件
        const fmtSelect = document.createElement("select");
        fmtSelect.setAttribute("style", "position:absolute;top:6px;right:8px;z-index:2;font-size:12px;padding:2px;background:var(--b3-theme-background);border:1px solid var(--b3-theme-surface-lighter);border-radius:4px;color:var(--b3-theme-on-surface)");
        const modes: Array<{value: "off"|"gentle"|"original", label: string}> = [
            { value: "off", label: "关" },
            { value: "gentle", label: "温" },
            { value: "original", label: "原" },
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
        fmtSelect.title = "格式化: 关/温/原 (可切换)";
        container.appendChild(fmtSelect);
        fmtSelect.addEventListener("change", async () => {
            const modeVal = (fmtSelect.value as "off"|"gentle"|"original");
            container.dataset.formattingMode = modeVal;
            (this.plugin.data as any)["menu-config"].formattingMode = modeVal;
            if (typeof (this.plugin as any).saveData === "function") {
                await (this.plugin as any).saveData("menu-config");
            }
            if (isDev) this.logger.info("格式化模式切换为", modeVal);
        });

        // 右下角的可拖动手柄
        const dragHandle = document.createElement("div");
        // container.setAttribute("style", ref_textarea.style.cssText);
        dragHandle.setAttribute("style", "width: 0px; height: 0px; border-bottom:1em solid grey;border-left:1em solid transparent;position:absolute;bottom: 0;right: 0;cursor: nwse-resize;z-index:1");
        container.appendChild(dragHandle);

        //设定内部样式
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

        // 设定快捷键透传
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

        // 避免漏判情况发生是还渲染编辑器
        if (!startState) return; 
            
        const view = new EditorView({
            state:startState,
            parent: container
        });

        // 对container的监听，防止keydown数据冒泡触发其他东西
        this.container_handle = (e) => {
            e.stopPropagation();
        };
        container.addEventListener("keydown", this.container_handle);
        // 对原textarea的监听同步，兼容数学公式插件
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
        // 为避免外部（如其他插件或思源内置）在 input 时对 LaTeX 进行强制格式化，
        // 数学模式下不再从 textarea -> CodeMirror 做反向同步，仅保留 CodeMirror -> textarea 的单向同步。
        // 这样可以最大限度保留用户原始换行与括号。
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
        // 实时读取补全
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

        // 打开时是否自动格式化
        const docValue = formattingMode === "original" ?
            (await prettier.format("$" + ref_textarea.value + "$", {
                printWidth: 80,
                useTabs: true,
                tabWidth: 2,
                parser: "latex-parser",
                plugins: [prettierPluginLatex]
            })).slice(1,-1) :
            ref_textarea.value;

        // “温和”格式化：仅规范换行与去掉行尾空白
        const gentleRun = (view: EditorView) => {
            try {
                const src = view.state.doc.toString();
                const formatted = this.gentleFormatLatex(src);
                if (formatted !== src) {
                    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: formatted } });
                }
            } catch (e) {
                if (isDev) this.logger.warn("手动格式化失败", e);
            }
            return true;
        };
        // “原始”格式化：使用 Prettier 的 latex-parser
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
                    if (isDev) this.logger.warn("手动格式化失败", e);
                }
            })();
            return true;
        };
        // “关闭”格式化：按键不进行任何变动
        const noopRun = (_view: EditorView) => true;

        // 简易提示气泡
        const flash = (text: string) => {
            const tip = document.createElement("div");
            tip.textContent = text;
            tip.setAttribute("style", "position:absolute;top:6px;right:52px;z-index:3;padding:2px 6px;border-radius:4px;background:var(--b3-theme-surface);color:var(--b3-theme-on-surface);border:1px solid var(--b3-theme-surface-lighter);font-size:12px;opacity:0.95;pointer-events:none");
            container.appendChild(tip);
            setTimeout(() => tip.remove(), 1000);
        };

        // 动态读取当前模式，保证切换下拉后热键立即生效
        const dynamicRun = (view: EditorView) => {
            const cur = ((container.dataset.formattingMode as any) ?? (this.plugin.data as any)["menu-config"]?.formattingMode ?? "off") as "off"|"gentle"|"original";
            if (cur === "original") { const r = prettierRun(view); flash("格式化：原"); return r; }
            if (cur === "gentle") { const r = gentleRun(view); flash("格式化：温"); return r; }
            flash("格式化：关");
            return true; // off
        };
        // 避开系统冲突热键：仅使用 Alt-Shift-F
        const formatCommandAlt: KeyBinding = { key: "Alt-Shift-f", run: dynamicRun, preventDefault: true, stopPropagation: true };
        const formatKeymap = Prec.high(keymap.of([formatCommandAlt]));

        const startState = EditorState.create({
            doc: docValue,
            extensions: [
                // math 模式：仅在“原始”模式下启用 closeBrackets，以符合原仓库行为
                keymap.of([...keybinds, ...vscodeKeymap]),
                formatKeymap,
                EditorView.lineWrapping,
                EditorView.updateListener.of((e) => {
                    // 自动同步到原本的textarea中，并触发input事件
                    const sync_val = e.state.doc.toString();
                    // 如果内容相同就不触发，避免循环触发
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

    // 仅做温和的 LaTeX 格式化：
    // - 统一换行符为 \n
    // - 去除每行行尾空白
    // - 保留用户的行结构与花括号，不做重排/重写
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
                    // 自动同步到原本的textarea中，并触发input事件
                    const sync_val = e.state.doc.toString();
                    // 如果内容相同就不触发，避免循环触发
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
                    // 自动同步到原本的textarea中，并触发input事件
                    const sync_val = e.state.doc.toString();
                    // 如果内容相同就不触发，避免循环触发
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