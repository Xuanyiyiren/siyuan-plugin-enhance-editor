import PluginEnhanceEditor from "./index";
import { Completion, snippetCompletion } from "@codemirror/autocomplete";

export class EditorCompletions {
    constructor(private plugin: PluginEnhanceEditor) {}

    public async get() {
        return await Promise.all([this.getCompletionsFromFile(), this.getSnippetsFromFile()]).then(res => [...res[0], ...res[1]]);
    }

    private async getCompletionsFromFile(): Promise<Completion[]> {
        return await this.plugin.kernelApi.getFile("/data/plugins/siyuan-plugin-enhance-editor/completions/KaTex_Completions.json", "json");
    }

    private async getSnippetsFromFile(): Promise<Completion[]> {
        return (await this.plugin.kernelApi.getFile("/data/plugins/siyuan-plugin-enhance-editor/completions/KaTex_Snippets.json", "json")).map((snippet: Completion) => {
            if (snippet["apply"]) return snippetCompletion((snippet["apply"] as string), snippet);
            return snippetCompletion(snippet["label"], snippet);
        }) as Completion[];
    }
}