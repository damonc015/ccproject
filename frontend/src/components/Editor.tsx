import { useEffect, useRef } from 'react';
import { basicSetup } from 'codemirror';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { indentUnit } from '@codemirror/language';
import { python } from '@codemirror/lang-python';
import { oneDark } from '@codemirror/theme-one-dark';
import { yCollab, yUndoManagerKeymap } from 'y-codemirror.next';
import type { MockCollabProvider } from '../collab/mockProvider';

interface Props {
  provider: MockCollabProvider;
  readOnly: boolean;
  dark: boolean;
  fontSize: number;
}

const lightTheme = EditorView.theme({
  '&': { backgroundColor: 'var(--surface)', color: 'var(--text)' },
  '.cm-gutters': { backgroundColor: 'var(--surface)', color: 'var(--muted)', border: 'none' },
  '.cm-activeLine': { backgroundColor: 'var(--hover)' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--hover)' },
});

const sizeTheme = (px: number) =>
  EditorView.theme({
    '&': { height: '100%', fontSize: `${px}px` },
    '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.55' },
    '.cm-content': { padding: '12px 0' },
  });

export function Editor({ provider, readOnly, dark, fontSize }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView>();
  const theme = useRef(new Compartment());
  const size = useRef(new Compartment());

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: provider.getText(),
        extensions: [
          keymap.of([...yUndoManagerKeymap, indentWithTab]),
          basicSetup,
          python(),
          indentUnit.of('    '),
          EditorState.readOnly.of(readOnly),
          theme.current.of(dark ? oneDark : lightTheme),
          size.current.of(sizeTheme(fontSize)),
          yCollab(provider.ytext, provider.awareness),
        ],
      }),
    });
    view.current = v;
    return () => v.destroy();
    // dark / fontSize are applied by the effects below without rebuilding the view
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, readOnly]);

  useEffect(() => {
    view.current?.dispatch({ effects: theme.current.reconfigure(dark ? oneDark : lightTheme) });
  }, [dark]);

  useEffect(() => {
    view.current?.dispatch({ effects: size.current.reconfigure(sizeTheme(fontSize)) });
  }, [fontSize]);

  return <div className="editor-host" ref={host} />;
}
