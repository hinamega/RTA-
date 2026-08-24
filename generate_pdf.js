const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const mdPath = path.join(__dirname, 'RTA”速”売会 企画書.md');
const mdContent = fs.readFileSync(mdPath, 'utf8');

// Simple marked parser or use marked via npx/script
// Let's create an HTML converter
function parseMarkdown(md) {
    let html = md
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^---$/gim, '<hr>')
        .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/gim, '<em>$1</em>')
        .replace(/`([^`]+)`/gim, '<code>$1</code>');

    // Handle lists
    const lines = html.split('\n');
    let inList = false;
    let inSubList = false;
    let result = [];

    for (let line of lines) {
        if (line.match(/^ {4,8}- (.*)$/)) {
            if (!inSubList) {
                result.push('<ul>');
                inSubList = true;
            }
            result.push(`<li>${line.replace(/^ {4,8}- /, '')}</li>`);
        } else if (line.match(/^ {0,3}- (.*)$/)) {
            if (inSubList) {
                result.push('</ul>');
                inSubList = false;
            }
            if (!inList) {
                result.push('<ul>');
                inList = true;
            }
            result.push(`<li>${line.replace(/^ {0,3}- /, '')}</li>`);
        } else if (line.match(/^ {0,3}[0-9]+\. (.*)$/)) {
            if (inSubList) {
                result.push('</ul>');
                inSubList = false;
            }
            if (!inList) {
                result.push('<ol>');
                inList = 'ol';
            }
            result.push(`<li>${line.replace(/^ {0,3}[0-9]+\. /, '')}</li>`);
        } else {
            if (inSubList) {
                result.push('</ul>');
                inSubList = false;
            }
            if (inList === 'ol') {
                result.push('</ol>');
                inList = false;
            } else if (inList) {
                result.push('</ul>');
                inList = false;
            }
            if (line.trim().length > 0 && !line.startsWith('<h') && !line.startsWith('<hr')) {
                result.push(`<p>${line}</p>`);
            } else {
                result.push(line);
            }
        }
    }
    if (inSubList) result.push('</ul>');
    if (inList === 'ol') result.push('</ol>');
    else if (inList) result.push('</ul>');

    return result.join('\n');
}

const parsedBody = parseMarkdown(mdContent);

const htmlDocument = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>RTA”速”売会 企画書</title>
<style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Noto+Sans+JP:wght@400;500;700;900&display=swap');

    @page {
        size: A4;
        margin: 20mm 18mm 20mm 18mm;
        @bottom-right {
            content: counter(page);
        }
    }

    * {
        box-sizing: border-box;
    }

    body {
        font-family: 'Noto Sans JP', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        color: #1e293b;
        background-color: #ffffff;
        line-height: 1.7;
        font-size: 10pt;
        margin: 0;
        padding: 0;
    }

    .container {
        max-width: 100%;
        margin: 0 auto;
    }

    /* Header Title */
    h1 {
        font-size: 20pt;
        font-weight: 900;
        color: #0f172a;
        border-bottom: 3px solid #2563eb;
        padding-bottom: 8px;
        margin-top: 0;
        margin-bottom: 24px;
        letter-spacing: 0.05em;
        display: flex;
        align-items: center;
        justify-content: space-between;
    }

    h1::after {
        content: "EVENT PROPOSAL";
        font-size: 9pt;
        font-weight: 700;
        color: #64748b;
        letter-spacing: 0.15em;
    }

    h2 {
        font-size: 13pt;
        font-weight: 700;
        color: #1e3a8a;
        background: #eff6ff;
        border-left: 4px solid #2563eb;
        padding: 6px 12px;
        margin-top: 22px;
        margin-bottom: 12px;
        border-radius: 0 4px 4px 0;
        page-break-after: avoid;
    }

    h3 {
        font-size: 10.5pt;
        font-weight: 700;
        color: #334155;
        margin-top: 14px;
        margin-bottom: 6px;
        page-break-after: avoid;
    }

    p {
        margin: 6px 0 10px 0;
        text-align: justify;
    }

    hr {
        border: none;
        border-top: 1px dashed #cbd5e1;
        margin: 18px 0;
    }

    ul, ol {
        margin: 6px 0 12px 0;
        padding-left: 20px;
    }

    li {
        margin-bottom: 4px;
    }

    li > ul {
        margin-top: 4px;
        margin-bottom: 6px;
    }

    strong {
        color: #0f172a;
        font-weight: 700;
    }

    code {
        font-family: Consolas, monospace;
        background-color: #f1f5f9;
        color: #0369a1;
        padding: 1px 4px;
        border-radius: 3px;
        font-size: 9pt;
    }

    /* Print optimization */
    @media print {
        body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }
        h2 {
            page-break-after: avoid;
        }
        ul, ol, p {
            page-break-inside: auto;
        }
    }
</style>
</head>
<body>
<div class="container">
${parsedBody}
</div>
</body>
</html>`;

const htmlPath = path.join(__dirname, 'RTA速売会_企画書.html');
const pdfPath = path.join(__dirname, 'RTA速売会_企画書.pdf');

fs.writeFileSync(htmlPath, htmlDocument, 'utf8');

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const command = `"${edgePath}" --headless --disable-gpu --no-pdf-header-footer --print-to-pdf="${pdfPath}" "${htmlPath}"`;

try {
    execSync(command);
    console.log('PDF successfully generated:', pdfPath);
} catch (err) {
    console.error('Error generating PDF:', err);
}
