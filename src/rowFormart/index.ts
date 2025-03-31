import * as vscode from "vscode";

// 计算字符串的视觉宽度
function getVisualLength(str: string): number {
  let length = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    // 中文和全角字符的宽度计为2
    if (code > 127 || code === 94) {
      length += 2;
    } else {
      length += 1;
    }
  }
  return length;
}

function attributionSort(textEditor: vscode.TextEditor, _: vscode.TextEditorEdit) {
  try {
    const document = textEditor.document;
    const selection = textEditor.selection;
    const line = document.lineAt(selection.active.line);
    const text = line.text;

    // 检查是否是JSX/HTML标签行
    if (!text.trim().startsWith('<')) {
      return;
    }

    // 提取标签名和属性，处理自闭合标签
    const tagMatch = text.match(/<([^\s>]+)([\s\S]*?)(\/?>|\s+\/>)/);
    if (!tagMatch) {
      return;
    }

    const [fullMatch, tagName, attributesString, closing] = tagMatch;
    const isSelfClosing = closing.includes('/');

    // 如果没有属性，保持原样
    if (!attributesString.trim()) {
      return;
    }

    // 解析属性
    const attributes: {
      name: string;
      value: string;
      length: number;
      visualLength: number;
      original: string
    }[] = [];
    let remaining = attributesString.trim();
    let inBracket = 0;
    let inQuote = false;
    let currentAttr = '';
    let quoteChar = '';

    // 逐字符解析以正确处理嵌套的括号和引号
    for (let i = 0; i < remaining.length; i++) {
      const char = remaining[i];
      const nextChar = remaining[i + 1] || '';

      // 处理引号
      if ((char === '"' || char === "'") && remaining[i - 1] !== '\\') {
        if (!inQuote) {
          inQuote = true;
          quoteChar = char;
        } else if (char === quoteChar) {
          inQuote = false;
        }
      }

      // 处理花括号
      if (!inQuote) {
        if (char === '{') {
          inBracket++;
        } else if (char === '}') {
          inBracket--;
        }
      }

      // 判断属性是否结束
      const isAttrEnd = !inQuote && inBracket === 0 && char === ' ' && nextChar !== '=' && currentAttr.trim();

      if (isAttrEnd || i === remaining.length - 1) {
        if (i === remaining.length - 1 && !isAttrEnd) {
          currentAttr += char;
        }

        const attrContent = currentAttr.trim();
        if (attrContent) {
          // 提取属性名和值
          const equalPos = attrContent.indexOf('=');
          if (equalPos === -1) {
            // 布尔属性
            attributes.push({
              name: attrContent,
              value: '',
              length: attrContent.length,
              visualLength: getVisualLength(attrContent),
              original: attrContent
            });
          } else {
            // 带值的属性
            const name = attrContent.slice(0, equalPos).trim();
            const value = attrContent.slice(equalPos).trim();
            const fullAttr = attrContent;
            attributes.push({
              name,
              value,
              length: fullAttr.length,
              visualLength: getVisualLength(fullAttr),
              original: attrContent
            });
          }
        }
        currentAttr = '';
      } else {
        currentAttr += char;
      }
    }

    // 如果没有找到有效的属性，保持原样
    if (attributes.length === 0) {
      return;
    }

    // 按照视觉长度和字母顺序排序
    attributes.sort((a, b) => {
      if (a.visualLength !== b.visualLength) {
        return a.visualLength - b.visualLength;
      }
      return a.name.localeCompare(b.name);
    });

    // 生成新的格式化代码
    const indent = text.match(/^\s*/)?.[0] || '';
    const attributeIndent = ' '.repeat(2);  // 2个空格的缩进
    const formattedAttributes = attributes
      .map(attr => `${indent}${attributeIndent}${attr.original}`)
      .join('\n');

    const newText = isSelfClosing
      ? `${indent}<${tagName}\n${formattedAttributes}\n${indent}/>`
      : `${indent}<${tagName}\n${formattedAttributes}\n${indent}>`;

    // 应用编辑
    const startPos = new vscode.Position(selection.active.line, 0);
    const endPos = new vscode.Position(selection.active.line, text.length);
    const range = new vscode.Range(startPos, endPos);

    textEditor.edit(editBuilder => {
      editBuilder.replace(range, newText);
    });

    vscode.window.showInformationMessage("属性排序成功！");
  } catch (error: any) {
    console.error("详细错误信息:", error);
    vscode.window.showErrorMessage(`属性排序失败：${error.message}`);
    return;
  }
}

export default attributionSort;
