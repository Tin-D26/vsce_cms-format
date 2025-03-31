import * as vscode from 'vscode';

// 计算字符串的视觉宽度（中文字符算2个单位，英文字符算1个单位）
function getVisualWidth(str: string): number {
  let width = 0;
  for (let i = 0; i < str.length; i++) {
    // 中文字符和全角字符的宽度为2
    if (/[\u4e00-\u9fa5]|[\uff00-\uffff]/.test(str[i])) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
}

// 格式化代码行，处理函数长度超过50的情况
function formatLine(line: string): string {
  const trimmedLine = line.trim();
  if (trimmedLine.includes('function') && getVisualWidth(trimmedLine) > 50) {
    // 在括号后添加换行
    return trimmedLine.replace(/\) {/, ')\n{');
  }
  return trimmedLine;
}

// 检查是否在HTML标签内
function isInHtmlTag(document: vscode.TextDocument, position: vscode.Position): boolean {
  const line = document.lineAt(position.line).text;
  const leftTagIndex = line.lastIndexOf('<', position.character);
  const rightTagIndex = line.indexOf('>', position.character);

  // 如果光标在 < 和 > 之间，则认为在标签内
  return leftTagIndex !== -1 && rightTagIndex !== -1 &&
    leftTagIndex < position.character && position.character < rightTagIndex;
}

// 解析HTML标签属性
function parseAttributes(attributesString: string): string[] {
  const attributes: string[] = [];
  let current = '';
  let inQuote = false;
  let quoteChar = '';
  let inBracket = 0;

  for (let i = 0; i < attributesString.length; i++) {
    const char = attributesString[i];

    // 处理引号
    if ((char === '"' || char === "'") && attributesString[i - 1] !== '\\') {
      if (!inQuote) {
        inQuote = true;
        quoteChar = char;
      } else if (char === quoteChar) {
        inQuote = false;
      }
    }

    // 处理括号
    if (!inQuote) {
      if (char === '{') inBracket++;
      if (char === '}') inBracket--;
    }

    // 收集属性
    if (!inQuote && inBracket === 0 && char === ' ' && current.trim()) {
      attributes.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    attributes.push(current.trim());
  }

  return attributes.filter(attr => attr);
}

// 检查属性是否包含函数
function containsFunction(attr: string): boolean {
  return attr.includes('=>') || attr.includes('function');
}

// 检查是否是函数属性的开始
function isFunctionStart(line: string): boolean {
  return line.includes('on') && (line.includes('=>') || line.includes('function'));
}

// 检查是否是函数体的一部分
function isFunctionBody(line: string): boolean {
  return line.trim().startsWith('{') || line.trim().endsWith('}') || line.includes('});') || line.includes('()');
}

// 合并函数属性的多行
function mergeFunctionLines(lines: string[]): string[] {
  const result: string[] = [];
  let currentFunction = '';
  let inFunction = false;
  let bracketCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!inFunction && isFunctionStart(line)) {
      inFunction = true;
      currentFunction = line;
      bracketCount = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;

      if (bracketCount === 0 && line.includes('}}')) {
        inFunction = false;
        result.push(currentFunction);
        currentFunction = '';
      }
    } else if (inFunction) {
      bracketCount += (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
      currentFunction += ' ' + line;

      if (bracketCount === 0) {
        inFunction = false;
        result.push(currentFunction);
        currentFunction = '';
      }
    } else {
      result.push(line);
    }
  }

  return result;
}

// 主要排序功能
export function attributionSort() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  const document = editor.document;
  const selection = editor.selection;

  editor.edit(editBuilder => {
    // 处理HTML标签内的属性排序
    if (isInHtmlTag(document, selection.active)) {
      const line = document.lineAt(selection.active.line).text;
      const leftTagIndex = line.lastIndexOf('<', selection.active.character);
      const rightTagIndex = line.indexOf('>', selection.active.character);

      if (leftTagIndex === -1 || rightTagIndex === -1) return;

      // 提取标签名和属性
      const tagContent = line.substring(leftTagIndex + 1, rightTagIndex);
      const [tagName, ...attrParts] = tagContent.split(' ').filter(Boolean);
      if (!attrParts.length) return;

      // 解析属性
      const attributes = parseAttributes(attrParts.join(' '));

      // 将属性分为普通属性和函数属性
      const normalAttrs = attributes.filter(attr => !containsFunction(attr));
      const functionAttrs = attributes.filter(attr => containsFunction(attr));

      // 分别排序普通属性和函数属性
      const sortedNormalAttrs = normalAttrs.sort((a, b) => {
        const widthA = getVisualWidth(a);
        const widthB = getVisualWidth(b);
        if (widthA !== widthB) return widthA - widthB;
        return a.localeCompare(b);
      });

      const sortedFunctionAttrs = functionAttrs.sort((a, b) => {
        const widthA = getVisualWidth(a);
        const widthB = getVisualWidth(b);
        if (widthA !== widthB) return widthA - widthB;
        return a.localeCompare(b);
      });

      // 合并排序后的属性
      const sortedAttributes = [...sortedNormalAttrs, ...sortedFunctionAttrs];

      // 重建标签
      const indent = line.match(/^\s*/)?.[0] || '';
      const isSelfClosing = line.trim().endsWith('/>');
      const attributeIndent = indent + '  '; // 两个空格的缩进

      const formattedTag = `${indent}<${tagName}\n` +
        sortedAttributes.map(attr => `${attributeIndent}${attr}`).join('\n') +
        `\n${indent}${isSelfClosing ? '/>' : '>'}`;

      const range = new vscode.Range(
        new vscode.Position(selection.active.line, 0),
        new vscode.Position(selection.active.line, line.length)
      );
      editBuilder.replace(range, formattedTag);
    }
    // 处理选中内容的排序
    else if (!selection.isEmpty) {
      const text = document.getText(selection);
      const lines = text.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

      // 首先合并函数属性的多行
      const mergedLines = mergeFunctionLines(lines);

      // 将行分为普通行和函数行
      const normalLines = mergedLines.filter(line => !isFunctionStart(line));
      const functionLines = mergedLines.filter(line => isFunctionStart(line));

      // 分别排序普通行和函数行
      const sortedNormalLines = normalLines.sort((a, b) => {
        const widthA = getVisualWidth(a);
        const widthB = getVisualWidth(b);
        if (widthA !== widthB) return widthA - widthB;
        return a.localeCompare(b);
      });

      const sortedFunctionLines = functionLines.sort((a, b) => {
        const widthA = getVisualWidth(a);
        const widthB = getVisualWidth(b);
        if (widthA !== widthB) return widthA - widthB;
        return a.localeCompare(b);
      });

      // 合并排序后的行并格式化
      const sortedLines = [...sortedNormalLines, ...sortedFunctionLines]
        .map(line => {
          // 如果是函数属性，保持原有的缩进格式
          if (isFunctionStart(line)) {
            return line.split('\n').map((l, i) => {
              if (i === 0) return l;
              return '  ' + l.trim();
            }).join('\n');
          }
          return line;
        })
        .join('\n');

      editBuilder.replace(selection, sortedLines);
    }
  });
}

export default attributionSort;
