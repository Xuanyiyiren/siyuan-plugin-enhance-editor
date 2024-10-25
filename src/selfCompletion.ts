import { Completion } from "@codemirror/autocomplete";

export const selfCompletionList: Completion[] = [
    {
        "label": "\\",
        "displayLabel": "\\\\",
        "apply": "\\\n",
        "type": "micro"
    }
];