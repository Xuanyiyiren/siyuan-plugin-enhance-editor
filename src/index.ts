import {
    Plugin,
    getFrontend,
} from "siyuan";
import "./index.scss";
import { ILogger, createLogger } from "./utils/simple-logger";
import KernelApi from "./api/kernel-api";
import { isDev } from "./utils/constants";
import { EditorLoader } from "./codeMirrorLoader/loader";

const STORAGE_NAME = "menu-config";

export default class PluginEnhanceEditor extends Plugin {

    private isMobile: boolean;
    public kernelApi: KernelApi;
    public editorLoader: EditorLoader;

    private logger: ILogger;

    onload() {
        this.data[STORAGE_NAME] = {
            openSideBarMemo: false,
            formattingMode: "off" // off | gentle | original
        };

        const frontEnd = getFrontend();
        this.isMobile = frontEnd === "mobile" || frontEnd === "browser-mobile";

        this.logger = createLogger("main");
        this.logger.info("load");
    }

    async onLayoutReady() {
        await this.loadData(STORAGE_NAME);

        this.kernelApi = new KernelApi();
        this.editorLoader = new EditorLoader(this);
        this.initHandleFunctions();
    }

    onunload() {
        this.eventBus.off("open-noneditableblock", this.loadCodeMirror.bind(this));
        this.logger.info("unload");
    }

    private initHandleFunctions() {
        this.eventBus.on("open-noneditableblock", this.loadCodeMirror.bind(this));
    }

    private async loadCodeMirror(ev: Event) {
    if (isDev) this.logger.info("Event fired: open-noneditableblock =>", ev);
        const protyle_util = (ev as any).detail.toolbar.subElement;
        const blockElement = (ev as any).detail.blockElement;
        const renderElement = (ev as any).detail.renderElement as HTMLElement;
        const renderType = renderElement.getAttribute("data-type");
        this.editorLoader.loadCodeMirror(protyle_util, renderType);
    }
}
