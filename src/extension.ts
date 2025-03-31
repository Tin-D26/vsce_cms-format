import * as vscode from "vscode";
import importSort from "./importSort";
import rowFormart from "./rowFormart";
import attributionSort from "./attributionSort";

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerTextEditorCommand("format.importSort", importSort),
    vscode.commands.registerTextEditorCommand("format.rowFormart", rowFormart),
    vscode.commands.registerTextEditorCommand("format.attributionSort", attributionSort)
  );
}

export function deactivate() { }
