import { EditorView, KeyBinding, keymap, ViewUpdate } from "@codemirror/view";
import { Compartment, EditorState, Extension } from "@codemirror/state";
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
import * as prettier from "prettier";
import * as prettierPluginLatex from "prettier-plugin-latex";
import { createLogger, ILogger } from "../utils/simple-logger";

export class EditorLoader {
    // 标记是否textarea为自动更新
    private updateMarker: boolean;
    private dragHandle: HTMLElement;
    private view: EditorView;
    private ref_textarea: HTMLTextAreaElement;
    private container: HTMLDivElement;
    private logger: ILogger;
    private isResizing: boolean;
    private lastX:number;
    private lastY:number;

    constructor(private plugin: PluginEnhanceEditor){
        this.updateMarker = false;
        this.logger = createLogger("Codemirror Loader");
        this.isResizing = false;
        this.lastX = 0;
        this.lastY = 0;
    }

    public unload() {
        this.ref_textarea && (this.ref_textarea.style.display = "true");
        this.ref_textarea && this.ref_textarea.removeEventListener("input", this.updateTextarea.bind(this));
        this.dragHandle && this.dragHandle.remove();
        this.view && this.view.destroy();
        this.container && this.container.remove();
    }

    public async loadCodeMirror(root: HTMLElement) {
        // 判断打开的块的类型
        const type = this.detectBlockType(root);
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
        const width = ref_textarea.style.width;
        container.setAttribute("class", "b3-text-field--text");
        container.setAttribute("id", "editorEnhanceContainer");
        container.setAttribute("style", `width:${width};max-height: calc(-44px + 80vh); min-height: 48px; min-width: 268px; border-radius: 0 0 var(--b3-border-radius-b) var(--b3-border-radius-b); font-family: var(--b3-font-family-code);position:relative`);
        ref_textarea.parentNode.insertBefore(container, ref_textarea);
        ref_textarea.style.display = "none";
        this.ref_textarea = ref_textarea;
        this.container = container;

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
                startState = await this.generateStateMath(ref_textarea, keybinds, editorTheme, mode);
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
            
        const view = new EditorView({
            state:startState,
            parent: container
        });

        // 对原textarea的监听同步，兼容数学公式插件
        ref_textarea.removeEventListener("input", this.updateFromTextarea.bind(this));
        ref_textarea.addEventListener("input", this.updateFromTextarea.bind(this));
        //处理handle，先remove再添加
        dragHandle.removeEventListener("mousedown", this.handleMouseDown.bind(this));
        window.removeEventListener("mousemove", this.handleMouseMove.bind(this));
        window.removeEventListener("mouseup", this.handleMouseUp.bind(this));
        dragHandle.addEventListener("mousedown", this.handleMouseDown.bind(this));
        window.addEventListener("mousemove", this.handleMouseMove.bind(this));
        window.addEventListener("mouseup", this.handleMouseUp.bind(this));
        this.dragHandle = dragHandle;
        
        view.focus();
        this.view = view;
    }

    private async generateStateMath(
        ref_textarea:HTMLTextAreaElement,
        keybinds: KeyBinding[],
        editorTheme: Extension,
        mode:any
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

        const docValue = (await prettier.format(
            "$" + ref_textarea.value + "$",
            {
                printWidth: 80,
                useTabs: true,
                tabWidth: 2,
                parser: "latex-parser",
                plugins: [prettierPluginLatex]
            }
        )).slice(1,-1);

        const startState = EditorState.create({
            doc: docValue,
            extensions: [
                keymap.of([...keybinds,...vscodeKeymap]),
                EditorView.lineWrapping,
                EditorView.updateListener.of(this.updateTextarea.bind(this)),
                autocompletion({
                    defaultKeymap: false,
                    override: [mathCompletions]
                }),
                closeBrackets(),
                bracketMatching(),
                editorTheme,
                mode ? githubDark: githubLight,
                history()
                
            ]
        });
        return startState;
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
                EditorView.updateListener.of(this.updateTextarea.bind(this)),
                languageConf.of(docIsJs ? javascript() : sql()),
                autoLanguage,
                autocompletion(),
                bracketMatching(),
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
                EditorView.updateListener.of(this.updateTextarea.bind(this)),
                languageConf.of(html()),
                autocompletion(),
                editorTheme,
                mode ? githubDark: githubLight,
                history()
                
            ]
        });
        return startState;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private updateFromTextarea(ev: CustomEvent) {
        if (this.updateMarker) {
            this.updateMarker = false;
            return;
        }
        this.view.dispatch({
            changes: {
                from: 0,
                to: this.view.state.doc.length,
                insert: this.ref_textarea.value
            }
        });
    }

    private updateTextarea(e: ViewUpdate) {
        // 自动同步到原本的textarea中，并触发input事件
        const sync_val = e.state.doc.toString();
        // 如果内容相同就不触发，避免循环触发
        if (this.ref_textarea.value === sync_val) {
            return;
        }
        this.ref_textarea.value = sync_val;
        this.updateMarker = true;
        this.ref_textarea.dispatchEvent(new Event("input", {
            bubbles: true,
            cancelable: true
        }));
    }

    private detectBlockType(protyleUtil:HTMLElement): string{
        const title = protyleUtil.querySelector(".fn__flex-1.resize__move") as HTMLElement;
        console.log(title);
        const innerText = title.innerText;
        if (innerText === (window as unknown as {siyuan: any}).siyuan.languages["inline-math"] || innerText === (window as unknown as {siyuan: any}).siyuan.languages["math"]){
            return "math";
        } else if (innerText === (window as unknown as {siyuan: any}).siyuan.languages["embedBlock"]){
            return "sql/js";
        } else if (innerText === "HTML"){
            return "html";
        } else return "unknown";
    }

    private handleMouseDown(e: MouseEvent) {
        e.preventDefault();
        this.isResizing = true;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
    }

    private handleMouseMove(e: MouseEvent) {
        const scroll = this.container.querySelector(".cm-scroller") as HTMLElement;
        if (!this.isResizing) return;

        const deltaX = e.clientX - this.lastX;
        const deltaY = e.clientY - this.lastY;

        const newWidth = this.container.offsetWidth + deltaX;
        const newHeight = scroll.offsetHeight + deltaY;

        this.container.style.width = `${newWidth}px`;
        scroll.style.height = `${newHeight}px`;

        this.lastX = e.clientX;
        this.lastY = e.clientY;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private handleMouseUp(e: MouseEvent) {
        this.isResizing = false;
    }

}