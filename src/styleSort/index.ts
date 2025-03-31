import * as vscode from "vscode";

function sortStyleBlocks(text: string): string {
  const styleBlockRegex = /[^{]*{[^}]*}/g;
  const styleBlocks = text.match(styleBlockRegex) || [];
  styleBlocks.sort((a, b) => a.length - b.length);
  const newText = text.replace(
    styleBlockRegex,
    () => styleBlocks.shift() || ""
  );
  return newText;
}

function styleSort() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  const document = editor.document;
  const fileType = document.fileName.split(".").pop()?.toLowerCase();
  if (!["css", "less", "sass", "scss"].includes(fileType || "")) {
    vscode.window.showErrorMessage(
      "This command can only run on CSS, LESS, or SASS files"
    );
    return;
  }

  const fullText = document.getText();
  const sortedText = sortStyleBlocks(fullText);

  editor.edit((editBuilder) => {
    const fullRange = new vscode.Range(
      document.positionAt(0),
      document.positionAt(fullText.length)
    );
    editBuilder.replace(fullRange, sortedText);
  });
}

export default styleSort;
