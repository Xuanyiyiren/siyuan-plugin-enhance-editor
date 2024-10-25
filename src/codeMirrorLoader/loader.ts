import { EditorView, keymap, ViewUpdate } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { vscodeKeymap } from "@replit/codemirror-vscode-keymap";
import { autocompletion, closeBrackets, CompletionContext} from "@codemirror/autocomplete";
import {EditorCompletions} from "./editorCompletions";
import PluginEnhanceEditor from "../index";
import { oneDark } from "@codemirror/theme-one-dark";
import { isDev } from "../utils/constants";

export class EditorLoader {
    // 标记是否textarea为自动更新
    private updateMarker: boolean;
    private dragHandle: HTMLElement;
    private view: EditorView;
    private ref_textarea: HTMLTextAreaElement;
    private container: HTMLDivElement;

    constructor(private plugin: PluginEnhanceEditor){
        this.updateMarker = false;
    }

    public async loadCodeMirror(root: HTMLElement) {
        const ref_textarea = root.querySelector("textarea");
        // console.log(ref_textarea);
        const container = document.createElement("div");
        // container.setAttribute("style", ref_textarea.style.cssText);
        container.setAttribute("class", "b3-text-field--text");
        container.setAttribute("id", "editorEnhanceContainer");
        container.setAttribute("style", "max-height: calc(-44px + 80vh); min-height: 48px; min-width: 268px; border-radius: 0 0 var(--b3-border-radius-b) var(--b3-border-radius-b); font-family: var(--b3-font-family-code)");
        ref_textarea.parentNode.insertBefore(container, ref_textarea);
        ref_textarea.style.display = "none";
        this.ref_textarea = ref_textarea;
        this.container = container;
        this.loadCodeMirrorMath(ref_textarea, container);
    }

    public unload() {
        this.ref_textarea.style.display = "true";
        this.ref_textarea.removeEventListener("input", this.updateTextarea.bind(this));
        this.dragHandle.remove();
        this.view.destroy();
        this.container.remove();
    }

    private async loadCodeMirrorMath(
        ref_textarea: HTMLTextAreaElement, 
        container:HTMLDivElement
    ) {
        // 获取用户设置信息
        const userConfig = (window as unknown as {siyuan: any}).siyuan.config;
        // 白天黑夜模式
        const mode  = userConfig.appearance.mode;
        // 插入快捷键
        if (isDev) console.log(userConfig);
        // 右下角的可拖动手柄
        const dragHandle = document.createElement("div");
        // container.setAttribute("style", ref_textarea.style.cssText);
        dragHandle.setAttribute("style", "width: 0px; height: 0px; border-bottom:1em solid grey;border-left:1em solid transparent;position: absolute;bottom: 0;right: 0;cursor: nwse-resize;");
        container.appendChild(dragHandle);
        function processResize(container:HTMLElement, handle:HTMLElement) {
            const scroll = container.querySelector(".cm-scroller") as HTMLElement;
            if (isDev) console.log(scroll);
            let isResizing = false;
            let lastX = 0;
            let lastY = 0;
    
            handle.addEventListener("mousedown", (e) => {
                e.preventDefault();
                isResizing = true;
                lastX = e.clientX;
                lastY = e.clientY;
            });
    
            window.addEventListener("mousemove", (e) => {
                if (!isResizing) return;
    
                const deltaX = e.clientX - lastX;
                const deltaY = e.clientY - lastY;
    
                const newWidth = container.offsetWidth + deltaX;
                const newHeight = scroll.offsetHeight + deltaY;
    
                container.style.width = `${newWidth}px`;
                scroll.style.height = `${newHeight}px`;
    
                lastX = e.clientX;
                lastY = e.clientY;
            });
    
            window.addEventListener("mouseup", () => {
                isResizing = false;
            });
        }

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
            }
        });

        // 实时读取补全
        const editorCompletions = new EditorCompletions(this.plugin);
        const completionList = await editorCompletions.get();

        function mathCompletions(context: CompletionContext) {
            const word = context.matchBefore(/(\\[\w\{\}]*)/);
            if (!word || (word.from == word.to && !context.explicit))
                return null;
            return {
                from: word.from,
                options: completionList
            };
        }

        const startState = EditorState.create({
            doc: ref_textarea.value,
            extensions: [
                keymap.of(vscodeKeymap),
                EditorView.lineWrapping,
                EditorView.updateListener.of(this.updateTextarea.bind(this)),
                autocompletion({
                    defaultKeymap: false,
                    override: [mathCompletions]
                }),
                closeBrackets(),
                oneDark,
                editorTheme
            ]
        });
        const view = new EditorView({
            state:startState,
            parent: container
        });

        // 对原textarea的监听同步，兼容数学公式插件
        ref_textarea.addEventListener("input", this.updateFromTextarea.bind(this));
        //处理handle
        processResize(container, dragHandle);
        this.dragHandle = dragHandle;
        
        view.focus();
        this.view = view;
    }

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
        this.ref_textarea.value = sync_val;
        this.updateMarker = true;
        this.ref_textarea.dispatchEvent(new Event("input", {
            bubbles: true,
            cancelable: true
        }));
    }

}