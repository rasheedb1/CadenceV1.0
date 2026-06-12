import { useEffect, useRef, useState } from 'react';
import { Send, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  disabled?: boolean;
  loading?: boolean;
  onSend: (text: string) => void;
  onCancel?: () => void;
  placeholder?: string;
}

export function ChatInput({ disabled, loading, onSend, onCancel, placeholder }: Props) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto';
      ref.current.style.height = `${Math.min(ref.current.scrollHeight, 200)}px`;
    }
  }, [text]);

  const submit = () => {
    const t = text.trim();
    if (!t || loading || disabled) return;
    onSend(t);
    setText('');
  };

  return (
    <div className="border-t border-border/50 bg-background/40 px-4 py-3">
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
          }}
          disabled={disabled}
          placeholder={placeholder ?? 'Escribe tu mensaje… (Enter envía, Shift+Enter nueva línea)'}
          rows={1}
          className="flex-1 resize-none rounded-xl border border-border/50 bg-background px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
        />
        {loading ? (
          <Button size="icon" variant="secondary" onClick={onCancel} title="Detener">
            <Square className="h-4 w-4" />
          </Button>
        ) : (
          <Button size="icon" onClick={submit} disabled={disabled || !text.trim()} title="Enviar">
            <Send className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
