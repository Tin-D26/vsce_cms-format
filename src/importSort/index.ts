import * as vscode from "vscode";

// 检查导入语句是否已经正确排序
function isAlreadySorted(imports: { importLine: string; comment?: string; docComment?: string }[]): boolean {
  const deps: typeof imports = [];
  const locals: typeof imports = [];

  imports.forEach(imp => {
    if (imp.importLine.includes('@/') || imp.importLine.includes('./') || /import\s+["']\./.test(imp.importLine)) {
      locals.push(imp);
    } else {
      deps.push(imp);
    }
  });

  // 检查依赖项是否已排序
  const isSortedByLength = (arr: typeof imports) => {
    for (let i = 0; i < arr.length - 1; i++) {
      const currentLength = arr[i].importLine.split('//')[0].length;
      const nextLength = arr[i + 1].importLine.split('//')[0].length;
      if (currentLength > nextLength) {
        return false;
      }
    }
    return true;
  };

  // 检查依赖项和本地导入是否已正确排序
  return isSortedByLength(deps) && isSortedByLength(locals);
}

function importsort(textEditor: vscode.TextEditor, _: vscode.TextEditorEdit) {
  try {
    const document = textEditor.document;
    const text = document.getText();
    const languageId = document.languageId;

    if (
      ![
        "javascript",
        "typescript",
        "javascriptreact",
        "typescriptreact",
      ].includes(languageId)
    ) {
      vscode.window.showErrorMessage("暂不支持该文件类型！");
      return;
    }

    // 1. 提取文档注释和所有import语句
    const docCommentRegex = /^\/\*\*[\s\S]*?\*\//;
    const docComment = text.match(docCommentRegex)?.[0] || '';

    const importRegex = /^import[\s\S]*?;(?:\s*\/\/.*)?$/gm;
    const matches = text.match(importRegex);
    if (!matches) return;

    // 记录第一个import的位置
    const firstImportIndex = text.indexOf(matches[0]);
    const lastImportIndex = text.indexOf(matches[matches.length - 1]) + matches[matches.length - 1].length;

    // 获取所有import相关的行（包括注释）
    const importSection = text.slice(firstImportIndex, lastImportIndex + 1);
    const lines = importSection.split('\n');

    // 收集import语句和注释
    const imports: { importLine: string; comment?: string; docComment?: string }[] = [];
    let currentComment: string | undefined;
    let currentDocComment: string | undefined;
    let currentImport = '';

    lines.forEach(line => {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('/**')) {
        currentDocComment = line;
      } else if (trimmedLine.startsWith('*/')) {
        if (currentDocComment) {
          currentDocComment += '\n' + line;
        }
      } else if (trimmedLine.startsWith('*') && currentDocComment) {
        currentDocComment += '\n' + line;
      } else if (trimmedLine.startsWith('//')) {
        currentComment = line;
      } else if (trimmedLine.startsWith('import') || currentImport) {
        // 如果是新的import语句或者正在处理多行import
        if (currentImport) {
          currentImport += ' ' + trimmedLine;
        } else {
          currentImport = trimmedLine;
        }

        // 检查是否是完整的import语句
        if (trimmedLine.includes(';')) {
          // 处理多行import，将其合并为一行
          const processedImport = currentImport
            .replace(/\s+/g, ' ')  // 将多个空白字符替换为单个空格
            .replace(/{\s*([^}]+)\s*}/g, (_, content) => {
              const items = content
                .split(',')
                .map(item => item.trim())
                .filter(Boolean)
                .sort()  // 对大括号内的导入项进行排序
                .join(', ');
              return `{ ${items} }`;
            })
            .trim();

          // 检查这一行是否包含行内注释
          const [importPart, ...commentParts] = processedImport.split('//');
          const inlineComment = commentParts.length ? '//' + commentParts.join('//') : '';

          // 如果有行内注释，使用行内注释
          if (inlineComment) {
            imports.push({
              importLine: importPart.trim() + '  ' + inlineComment,
              docComment: currentDocComment
            });
          } else if (currentComment) {
            // 如果有独立的行注释，添加到import语句后面
            imports.push({
              importLine: importPart.trim() + '  ' + currentComment.trim(),
              docComment: currentDocComment
            });
          } else {
            imports.push({
              importLine: importPart.trim(),
              docComment: currentDocComment
            });
          }

          // 重置状态
          currentImport = '';
          currentComment = undefined;
          currentDocComment = undefined;
        }
      }
    });

    // 检查是否已经正确排序
    // if (isAlreadySorted(imports)) {
    //   vscode.window.showInformationMessage("导入已经正确排序！");
    //   return;
    // }

    // 3. 分类和排序
    const deps: typeof imports = [];
    const locals: typeof imports = [];

    imports.forEach(imp => {
      if (imp.importLine.includes('@/') || imp.importLine.includes('./') || /import\s+["']\./.test(imp.importLine)) {
        locals.push(imp);
      } else {
        deps.push(imp);
      }
    });

    // 按import部分的长度排序
    const sortByLength = (a: typeof imports[0], b: typeof imports[0]) => {
      // 只使用import部分的长度进行排序，忽略注释
      const aLength = a.importLine.split('//')[0].length;
      const bLength = b.importLine.split('//')[0].length;
      return aLength - bLength;
    };
    deps.sort(sortByLength);
    locals.sort(sortByLength);

    // 4. 组合结果
    const formatImport = (item: typeof imports[0]): string[] => {
      const lines: string[] = [];
      if (item.docComment) {
        lines.push(item.docComment.replace(/\n\s*$/, ''));
      }
      lines.push(item.importLine);
      return lines;
    };

    const parts: string[] = [];
    if (docComment) {
      parts.push(docComment.replace(/\n\s*$/, ''));
    }
    parts.push(...deps.flatMap(formatImport));
    if (locals.length > 0) {
      parts.push('');
      parts.push(...locals.flatMap(formatImport));
    }

    const result = parts.join('\n');

    // 5. 替换文本
    const startPos = document.positionAt(docComment ? firstImportIndex - docComment.length - 1 : firstImportIndex);
    const endPos = document.positionAt(lastImportIndex);
    const range = new vscode.Range(startPos, endPos);

    textEditor.edit(editBuilder => {
      editBuilder.replace(range, result);
    });

    vscode.window.showInformationMessage("导入排序成功！");
  } catch (error: any) {
    console.error("详细错误信息:", error);
    vscode.window.showErrorMessage(`导入排序失败：${error.message}`);
  }
}

export default importsort;
