import type { ReactNode } from 'react';
import { useState } from 'react';
import { TextField } from '@netproof/ui/text-field';

/** Numbered 3-column mnemonic grid, blurred until the user asks to see it. */
export function MnemonicGrid({
  words,
  hidden,
  onReveal,
}: {
  words: string[];
  hidden?: boolean;
  onReveal?: () => void;
}): ReactNode {
  return (
    <div className="np-stack">
      <div className={`np-mnemonic-grid${hidden ? ' np-blur' : ''}`}>
        {words.map((word, index) => (
          <div className="np-mnemonic-word" key={`${index}-${word}`}>
            <span className="np-mnemonic-word__index">{index + 1}</span>
            <span>{word}</span>
          </div>
        ))}
      </div>
      {hidden && onReveal ? (
        <button type="button" className="np-btn np-btn--secondary np-btn--block" onClick={onReveal}>
          点击显示助记词
        </button>
      ) : null}
    </div>
  );
}

/**
 * Recovery quiz: the user must identify three random positions. This is the only
 * thing standing between "I wrote it down" and "I think I wrote it down", so it
 * asks for words the user cannot guess from context.
 */
export function MnemonicQuiz({
  words,
  onPassed,
  positions,
}: {
  words: string[];
  onPassed: () => void;
  positions?: number[];
}): ReactNode {
  const [asked] = useState(() => positions ?? pickPositions(words.length));
  const [answers, setAnswers] = useState<string[]>(() => asked.map(() => ''));
  const [result, setResult] = useState<'idle' | 'wrong'>('idle');

  const allFilled = answers.every((answer) => answer.trim().length > 0);

  const verify = (): void => {
    /*
     * Read the fields, not the state.
     *
     * The inputs are uncontrolled (see `@netproof/ui/text-field`), and a keyboard can
     * still be mid-composition on the last word when the button is tapped — the state
     * update for that keystroke has not necessarily landed. The DOM is what the user can
     * see, so the DOM is what gets checked against the words they were shown.
     */
    const readAt = (position: number): string => {
      const element = document.getElementById(`quiz-${position}`);
      return (element as HTMLInputElement | null)?.value.trim().toLowerCase() ?? '';
    };
    const correct = asked.every((position) => readAt(position) === words[position]?.toLowerCase());
    if (correct) onPassed();
    else setResult('wrong');
  };

  return (
    <div className="np-stack">
      <p className="np-body np-body--tight">请按顺序填入对应位置的单词，以确认备份正确。</p>
      {asked.map((position, index) => (
        <div className="np-field" key={position}>
          <label className="np-label" htmlFor={`quiz-${position}`}>
            第 {position + 1} 个单词
          </label>
          {/*
            Uncontrolled on purpose: see `textField.tsx`. A controlled input here made a
            Chinese keyboard's composing text duplicate itself — typing `clu` produced
            `cclclu` — which is exactly the screen where the user is copying words they
            just wrote down, and the one place a wrong character costs them the wallet.
          */}
          <TextField
            id={`quiz-${position}`}
            className="np-input np-input--mono"
            lang="en"
            value={answers[index] ?? ''}
            onChange={(next) => {
              setAnswers((previous) => {
                const updated = [...previous];
                updated[index] = next;
                return updated;
              });
              setResult('idle');
            }}
          />
        </div>
      ))}
      {result === 'wrong' ? <div className="np-alert np-alert--danger">助记词不匹配，请重新检查第 1 屏的备份。</div> : null}
      <button type="button" className="np-btn np-btn--primary np-btn--block" disabled={!allFilled} onClick={verify}>
        验证备份
      </button>
    </div>
  );
}

/** Three spread-out positions, so a lucky guess is not enough. */
function pickPositions(length: number): number[] {
  const candidates = Array.from({ length }, (_, index) => index);
  const picked: number[] = [];
  const random = new Uint32Array(3);
  crypto.getRandomValues(random);
  for (let i = 0; i < 3 && candidates.length > 0; i++) {
    const index = random[i] % candidates.length;
    picked.push(candidates.splice(index, 1)[0]);
  }
  return picked.sort((a, b) => a - b);
}
