import React, { useState, useRef, useEffect } from "react";
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  CheckSquare,
  Heading1,
  Heading2,
  Link as LinkIcon,
  Eye,
  Code,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface FormattedTextProps {
  text: string;
  className?: string;
}

export function FormattedText({ text, className = "" }: FormattedTextProps) {
  if (!text) return null;

  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];

  let currentList: React.ReactNode[] = [];
  let currentListType: "ul" | "ol" | null = null;

  const flushList = (key: string | number) => {
    if (currentList.length > 0) {
      if (currentListType === "ul") {
        elements.push(
          <ul key={`ul-${key}`} className="list-disc pl-5 mb-2.5 space-y-1 text-sm text-foreground/90">
            {...currentList}
          </ul>
        );
      } else if (currentListType === "ol") {
        elements.push(
          <ol key={`ol-${key}`} className="list-decimal pl-5 mb-2.5 space-y-1 text-sm text-foreground/90">
            {...currentList}
          </ol>
        );
      }
      currentList = [];
      currentListType = null;
    }
  };

  const parseBoldItalic = (partText: string, baseKey: string): React.ReactNode[] => {
    const parts: React.ReactNode[] = [];
    const boldParts = partText.split("**");

    boldParts.forEach((boldPart, bIdx) => {
      const isBold = bIdx % 2 !== 0;
      const italicParts = boldPart.split("*");

      italicParts.forEach((italicPart, iIdx) => {
        const isItalic = iIdx % 2 !== 0;
        let content: React.ReactNode = italicPart;
        const key = `${baseKey}-${bIdx}-${iIdx}`;

        if (isBold && isItalic) {
          content = (
            <strong key={key} className="font-semibold text-foreground">
              <em>{italicPart}</em>
            </strong>
          );
        } else if (isBold) {
          content = (
            <strong key={key} className="font-semibold text-foreground">
              {italicPart}
            </strong>
          );
        } else if (isItalic) {
          content = (
            <em key={key} className="italic text-foreground/95">
              {italicPart}
            </em>
          );
        }

        parts.push(content);
      });
    });

    return parts;
  };

  const parseInline = (lineText: string): React.ReactNode[] => {
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let lastIndex = 0;
    const parts: React.ReactNode[] = [];
    let match;
    let keyIdx = 0;

    while ((match = linkRegex.exec(lineText)) !== null) {
      const textBefore = lineText.substring(lastIndex, match.index);
      if (textBefore) {
        parts.push(...parseBoldItalic(textBefore, `bi-${keyIdx++}`));
      }

      const label = match[1];
      const url = match[2];
      const href = url.startsWith("http") ? url : `https://${url}`;
      parts.push(
        <a
          key={`link-${keyIdx++}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline hover:text-primary/80 font-medium inline-flex items-center gap-0.5"
        >
          {label}
        </a>
      );

      lastIndex = linkRegex.lastIndex;
    }

    const textRemaining = lineText.substring(lastIndex);
    if (textRemaining) {
      parts.push(...parseBoldItalic(textRemaining, `bi-${keyIdx++}`));
    }

    return parts.length > 0 ? parts : [lineText];
  };

  lines.forEach((line, idx) => {
    const trimmed = line.trim();

    // Checkbox checklist item: - [ ] or - [x]
    const checklistMatch = line.match(/^(\s*)-\s+\[([ xX])\]\s+(.*)$/);
    if (checklistMatch) {
      flushList(idx);
      const checked = checklistMatch[2].toLowerCase() === "x";
      const content = checklistMatch[3];
      elements.push(
        <div key={`chk-${idx}`} className="flex items-start gap-2 my-1.5 text-sm">
          <input
            type="checkbox"
            checked={checked}
            readOnly
            className="mt-1 h-4 w-4 rounded border-border bg-background text-primary focus:ring-0 cursor-default"
          />
          <span className={checked ? "line-through text-muted-foreground/70" : "text-foreground/90"}>
            {parseInline(content)}
          </span>
        </div>
      );
      return;
    }

    // Bullet list item: - or *
    const bulletMatch = line.match(/^(\s*)[-*]\s+(.*)$/);
    if (bulletMatch) {
      if (currentListType !== "ul") {
        flushList(idx);
        currentListType = "ul";
      }
      currentList.push(
        <li key={`li-${idx}`} className="my-0.5">
          {parseInline(bulletMatch[2])}
        </li>
      );
      return;
    }

    // Numbered list item: 1.
    const numberedMatch = line.match(/^(\s*)\d+\.\s+(.*)$/);
    if (numberedMatch) {
      if (currentListType !== "ol") {
        flushList(idx);
        currentListType = "ol";
      }
      currentList.push(
        <li key={`li-${idx}`} className="my-0.5">
          {parseInline(numberedMatch[2])}
        </li>
      );
      return;
    }

    // Header matches: # h1, ## h2, ### h3
    const headerMatch = line.match(/^(\s*)(#{1,6})\s+(.*)$/);
    if (headerMatch) {
      flushList(idx);
      const level = headerMatch[2].length;
      const content = headerMatch[3];
      const parsedContent = parseInline(content);

      if (level === 1) {
        elements.push(
          <h1 key={`h1-${idx}`} className="text-base font-bold mt-4 mb-2 text-foreground">
            {parsedContent}
          </h1>
        );
      } else if (level === 2) {
        elements.push(
          <h2 key={`h2-${idx}`} className="text-sm font-bold mt-3 mb-1.5 text-foreground">
            {parsedContent}
          </h2>
        );
      } else {
        elements.push(
          <h3 key={`h3-${idx}`} className="text-xs font-semibold mt-2.5 mb-1 text-foreground">
            {parsedContent}
          </h3>
        );
      }
      return;
    }

    // Normal line
    flushList(idx);
    if (trimmed === "") {
      elements.push(<div key={`br-${idx}`} className="h-2" />);
    } else {
      elements.push(
        <p key={`p-${idx}`} className="mb-1.5 leading-relaxed text-sm text-foreground/90">
          {parseInline(line)}
        </p>
      );
    }
  });

  // Flush remaining list items
  flushList("end");

  return <div className={`max-w-none text-foreground ${className}`}>{elements}</div>;
}

interface RichTextEditorProps {
  name?: string;
  value?: string;
  onChange?: (val: string) => void;
  defaultValue?: string;
  placeholder?: string;
  rows?: number;
  className?: string;
}

export function RichTextEditor({
  name,
  value: controlledValue,
  onChange,
  defaultValue = "",
  placeholder,
  rows = 4,
  className = "",
}: RichTextEditorProps) {
  const [localValue, setLocalValue] = useState(defaultValue);
  const isControlled = controlledValue !== undefined;
  const currentValue = isControlled ? controlledValue : localValue;

  const updateValue = (newValue: string) => {
    if (!isControlled) {
      setLocalValue(newValue);
    }
    if (onChange) {
      onChange(newValue);
    }
  };

  const [activeTab, setActiveTab] = useState<"edit" | "preview">("edit");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync default value if it changes
  useEffect(() => {
    if (defaultValue && !isControlled && localValue === "") {
      setLocalValue(defaultValue);
    }
  }, [defaultValue, isControlled]);

  // Sync controlled value changes
  useEffect(() => {
    if (isControlled && controlledValue !== undefined) {
      setLocalValue(controlledValue);
    }
  }, [controlledValue, isControlled]);

  const handleFormat = (type: "bold" | "italic" | "bullet" | "number" | "checklist" | "h1" | "h2" | "link") => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selectedText = text.substring(start, end);

    let replacement = "";
    let cursorOffset = 0;

    switch (type) {
      case "bold":
        replacement = `**${selectedText || "texto"}**`;
        cursorOffset = selectedText ? 0 : 2;
        break;
      case "italic":
        replacement = `*${selectedText || "texto"}*`;
        cursorOffset = selectedText ? 0 : 1;
        break;
      case "bullet":
        replacement = `\n- ${selectedText || "Item"}`;
        break;
      case "number":
        replacement = `\n1. ${selectedText || "Item"}`;
        break;
      case "checklist":
        replacement = `\n- [ ] ${selectedText || "Tarefa"}`;
        break;
      case "h1":
        replacement = `\n# ${selectedText || "Título"}`;
        break;
      case "h2":
        replacement = `\n## ${selectedText || "Subtítulo"}`;
        break;
      case "link":
        replacement = `[${selectedText || "Link"}](https://)`;
        cursorOffset = selectedText ? 12 : 1;
        break;
    }

    const newValue = text.substring(0, start) + replacement + text.substring(end);
    updateValue(newValue);

    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + replacement.length - cursorOffset;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  return (
    <div className={`w-full rounded-xl border border-border/80 bg-surface-elevated/40 shadow-sm overflow-hidden flex flex-col ${className}`}>
      {/* Header toolbar */}
      <div className="flex items-center justify-between border-b border-border/60 bg-muted/40 px-2 py-1 gap-2 flex-wrap shrink-0">
        {/* Formatting Buttons */}
        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 hover:bg-muted/70 rounded-md"
            title="Negrito (**texto**)"
            disabled={activeTab === "preview"}
            onClick={() => handleFormat("bold")}
          >
            <Bold className="h-3.5 w-3.5 text-foreground/80" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 hover:bg-muted/70 rounded-md"
            title="Itálico (*texto*)"
            disabled={activeTab === "preview"}
            onClick={() => handleFormat("italic")}
          >
            <Italic className="h-3.5 w-3.5 text-foreground/80" />
          </Button>
          <div className="w-[1px] h-3.5 bg-border/60 mx-1 shrink-0" />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 hover:bg-muted/70 rounded-md"
            title="Título Grande (# Título)"
            disabled={activeTab === "preview"}
            onClick={() => handleFormat("h1")}
          >
            <Heading1 className="h-3.5 w-3.5 text-foreground/80" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 hover:bg-muted/70 rounded-md"
            title="Título Médio (## Subtítulo)"
            disabled={activeTab === "preview"}
            onClick={() => handleFormat("h2")}
          >
            <Heading2 className="h-3.5 w-3.5 text-foreground/80" />
          </Button>
          <div className="w-[1px] h-3.5 bg-border/60 mx-1 shrink-0" />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 hover:bg-muted/70 rounded-md"
            title="Marcadores (- item)"
            disabled={activeTab === "preview"}
            onClick={() => handleFormat("bullet")}
          >
            <List className="h-3.5 w-3.5 text-foreground/80" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 hover:bg-muted/70 rounded-md"
            title="Lista Numerada (1. item)"
            disabled={activeTab === "preview"}
            onClick={() => handleFormat("number")}
          >
            <ListOrdered className="h-3.5 w-3.5 text-foreground/80" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 hover:bg-muted/70 rounded-md"
            title="Lista de Tarefas (- [ ] item)"
            disabled={activeTab === "preview"}
            onClick={() => handleFormat("checklist")}
          >
            <CheckSquare className="h-3.5 w-3.5 text-foreground/80" />
          </Button>
          <div className="w-[1px] h-3.5 bg-border/60 mx-1 shrink-0" />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 hover:bg-muted/70 rounded-md"
            title="Link ([rótulo](link))"
            disabled={activeTab === "preview"}
            onClick={() => handleFormat("link")}
          >
            <LinkIcon className="h-3.5 w-3.5 text-foreground/80" />
          </Button>
        </div>

        {/* Edit / Preview Tabs */}
        <div className="flex bg-muted p-0.5 rounded-lg border border-border/50 shrink-0">
          <Button
            type="button"
            variant={activeTab === "edit" ? "secondary" : "ghost"}
            size="sm"
            className={`h-6 px-2 text-[11px] gap-1 font-medium rounded-md ${
              activeTab === "edit"
                ? "shadow-sm bg-background hover:bg-background text-foreground font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab("edit")}
          >
            <Code className="h-3 w-3" /> Editar
          </Button>
          <Button
            type="button"
            variant={activeTab === "preview" ? "secondary" : "ghost"}
            size="sm"
            className={`h-6 px-2 text-[11px] gap-1 font-medium rounded-md ${
              activeTab === "preview"
                ? "shadow-sm bg-background hover:bg-background text-foreground font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab("preview")}
          >
            <Eye className="h-3 w-3" /> Visualizar
          </Button>
        </div>
      </div>

      {/* Editor Content Area */}
      <div className="relative grow flex flex-col bg-background">
        {activeTab === "edit" ? (
          <textarea
            ref={textareaRef}
            name={name}
            value={currentValue}
            onChange={(e) => updateValue(e.target.value)}
            placeholder={placeholder}
            rows={rows}
            className="flex w-full bg-transparent px-3 py-2 text-sm text-foreground focus-visible:outline-none placeholder:text-muted-foreground border-0 resize-y min-h-[90px] outline-none"
          />
        ) : (
          <div className="px-3 py-2.5 overflow-auto text-sm min-h-[90px] max-h-[300px] border-0 bg-muted/5 flex-grow">
            {currentValue.trim() ? (
              <FormattedText text={currentValue} />
            ) : (
              <span className="text-muted-foreground/60 italic text-xs">Visualização vazia. Digite algo para formatar!</span>
            )}
            {/* Hidden field so the form can still submit when tab is active */}
            {name && (
              <textarea
                name={name}
                value={currentValue}
                readOnly
                className="sr-only"
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
