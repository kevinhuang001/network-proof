/**
 * Reproduction harness for the composing-keyboard bug (`clu` arriving as `cclclu`).
 *
 * Not part of the app and not in any bundle: it is reachable only at `/ime-harness.html`
 * while the dev server runs, and it exists so this defect can be reproduced and the fix
 * verified with real IME composition events instead of argued about from first principles.
 *
 * The three fields are the three hypotheses, side by side:
 *   controlled        — what the quiz used to be, and the suspected cause
 *   TextField         — the replacement, uncontrolled while focused
 *   plain uncontrolled— the baseline that nothing can corrupt
 *
 * Drive it with CDP `Input.imeSetComposition` + `Input.insertText` (see docs/COMPAT.md).
 */
import type { ReactNode } from 'react';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@netproof/ui/theme.css';
import { TextField } from '@netproof/ui/text-field';
import { MnemonicQuiz } from '../src/components/Mnemonic';

const WORDS = [
  'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract',
  'absurd', 'abuse', 'access', 'accident', 'account', 'accuse', 'achieve', 'acid',
  'acoustic', 'acquire', 'across', 'act', 'action', 'actor', 'actress', 'actual',
];

function OldControlled(): ReactNode {
  const [value, setValue] = useState('');
  return (
    <input
      id="old-controlled"
      className="np-input np-input--mono"
      value={value}
      onChange={(event) => setValue(event.target.value)}
    />
  );
}

function NewField(): ReactNode {
  const [value, setValue] = useState('');
  return (
    <TextField
      id="new-field"
      className="np-input np-input--mono"
      value={value}
      onChange={setValue}
    />
  );
}

function Harness(): ReactNode {
  return (
    <div className="np-app">
      <div className="np-main">
        <h1 className="np-headline">IME harness</h1>
        <label className="np-label" htmlFor="old-controlled">controlled</label>
        <OldControlled />
        <label className="np-label" htmlFor="new-field">TextField</label>
        <NewField />
        <label className="np-label" htmlFor="plain">plain uncontrolled (baseline)</label>
        <input id="plain" className="np-input" defaultValue="" />
        <div id="values" className="np-mono" />

        <h2 className="np-headline">the reported screen</h2>
        <MnemonicQuiz
          words={WORDS}
          positions={[0, 7, 23]}
          onPassed={() => {
            document.getElementById('quiz-result')!.textContent = 'passed';
          }}
        />
        <div id="quiz-result" className="np-mono" />
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);
