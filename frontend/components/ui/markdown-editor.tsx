"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Bold, Italic, Link as LinkIcon, Heading2, List, ListOrdered } from "lucide-react";
import { useEffect, useCallback, useState } from "react";
import { Button } from "./button";
import TurndownService from "turndown";
import { marked } from "marked";

interface MarkdownEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  className?: string;
}

// Initialize turndown service for HTML to Markdown conversion
const turndownService = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

export function MarkdownEditor({
  content,
  onChange,
  placeholder = "Start writing...",
  className = "",
}: MarkdownEditorProps) {
  // Convert markdown to HTML for initial content
  const initialHtml = content ? marked.parse(content, { async: false }) as string : "";

  const editor = useEditor({
    immediatelyRender: false, // Fix SSR hydration issues
    extensions: [
      StarterKit.configure({
        // Enable headings and lists, disable other features
        heading: {
          levels: [1, 2, 3], // Support H1, H2, H3
        },
        bulletList: true,
        orderedList: true,
        listItem: true,
        // Disable features we don't need
        blockquote: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-primary underline cursor-pointer hover:text-primary/80",
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    content: initialHtml,
    editorProps: {
      attributes: {
        class:
          "focus:outline-none min-h-[240px] p-4 pt-16 text-[17px] leading-normal",
      },
    },
    onUpdate: ({ editor }) => {
      // Convert HTML to markdown
      const html = editor.getHTML();
      const markdown = turndownService.turndown(html);
      onChange(markdown);
    },
  });

  // Note: We don't sync content changes because parent uses key={bookmark.id}
  // This causes complete re-mount when switching bookmarks, so initial content is always fresh
  // During editing, we don't want to sync back to avoid destroying formatting

  const setLink = useCallback(() => {
    if (!editor) return;

    const previousUrl = editor.getAttributes("link").href;
    const url = window.prompt("URL", previousUrl);

    // cancelled
    if (url === null) {
      return;
    }

    // empty
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }

    // update link
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  if (!editor) {
    return null;
  }

  return (
    <div className={`relative ${className}`}>
      {/* Toolbar - always visible at top */}
      {editor && (
        <div className="absolute top-0 left-0 right-0 bg-background border-b border-border flex items-center gap-1 p-2 z-10 rounded-t-md"
        >
          <Button
            size="sm"
            variant="ghost"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`h-8 w-8 p-0 ${
              editor.isActive("bold") ? "bg-muted" : ""
            }`}
            type="button"
          >
            <Bold className="h-4 w-4" />
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`h-8 w-8 p-0 ${
              editor.isActive("italic") ? "bg-muted" : ""
            }`}
            type="button"
          >
            <Italic className="h-4 w-4" />
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={setLink}
            className={`h-8 w-8 p-0 ${
              editor.isActive("link") ? "bg-muted" : ""
            }`}
            type="button"
          >
            <LinkIcon className="h-4 w-4" />
          </Button>

          <div className="w-px h-6 bg-border mx-1" />

          <Button
            size="sm"
            variant="ghost"
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={`h-8 w-8 p-0 ${
              editor.isActive("heading", { level: 2 }) ? "bg-muted" : ""
            }`}
            type="button"
          >
            <Heading2 className="h-4 w-4" />
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`h-8 w-8 p-0 ${
              editor.isActive("bulletList") ? "bg-muted" : ""
            }`}
            type="button"
          >
            <List className="h-4 w-4" />
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={`h-8 w-8 p-0 ${
              editor.isActive("orderedList") ? "bg-muted" : ""
            }`}
            type="button"
          >
            <ListOrdered className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Editor content */}
      <EditorContent
        editor={editor}
        className="w-full min-h-[240px] rounded-md border border-input bg-background transition-all duration-200 hover:bg-muted/20 focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-0"
      />
    </div>
  );
}
