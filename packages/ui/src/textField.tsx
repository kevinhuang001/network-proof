import type { ComponentPropsWithoutRef, ReactNode, RefObject } from 'react';
import { useEffect, useRef } from 'react';

/**
 * Text fields that a composing keyboard cannot corrupt.
 *
 * The bug, as reported: typing `clu` into the backup quiz produced `cclclu`.
 *
 * Nothing appended the text — the input was *controlled*, and that is the whole story.
 * A phone keyboard for Chinese, Japanese or Korean does not type; it *composes*. It puts
 * provisional text into the field, calls it composing, and rewrites that region as the
 * user picks characters. A controlled React input writes its state back into the element
 * on every render, which destroys the composing region the keyboard believes it owns; the
 * keyboard then re-inserts its composition on top of what is already there. Type `c`, then
 * `cl`, then `clu`, and each composition lands after the last: `c` + `cl` + `clu` =
 * `cclclu`, exactly what the user saw.
 *
 * The fix is to stop writing state back while the user is editing. These components are
 * uncontrolled: the DOM owns the text while the field has focus, the parent still receives
 * every change (so validation, counters and enable/disable all still work), and the parent
 * regains control the moment the field loses focus — which keeps programmatic resets
 * (opening a rename dialog with a fresh value) working.
 *
 * This applies to every device text field, not just mnemonic words: the same keyboard
 * types wallet names and passphrases.
 */
function useComposingSafeValue<T extends HTMLInputElement | HTMLTextAreaElement>(
  value: string,
  ref: RefObject<T | null>,
  lastEmitted: RefObject<string>,
): void {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    /*
     * Two authorities, and the rule for which one wins.
     *
     * Focused and the last thing we heard about is this value: the keyboard owns the text,
     * so hands off. That is the case that used to corrupt composing text.
     *
     * Focused but the value differs from what we last emitted: the *parent* changed it —
     * a preset chip filling a calldata field, a dialog opening with a fresh name. The
     * parent is asking for something the user did not type, so it must win even while the
     * field has focus, or the screen would show one value and sign another.
     */
    const editing = element === document.activeElement && value === lastEmitted.current;
    if (editing) return;
    if (element.value !== value) element.value = value;
  }, [value, ref, lastEmitted]);
}

type InputProps = Omit<ComponentPropsWithoutRef<'input'>, 'value' | 'defaultValue' | 'onChange'>;
type TextAreaProps = Omit<
  ComponentPropsWithoutRef<'textarea'>,
  'value' | 'defaultValue' | 'onChange'
>;

export function TextField({
  value,
  onChange,
  ...rest
}: InputProps & { value: string; onChange: (next: string) => void }): ReactNode {
  const ref = useRef<HTMLInputElement | null>(null);
  const lastEmitted = useRef(value);
  useComposingSafeValue(value, ref, lastEmitted);
  return (
    <input
      {...rest}
      ref={ref}
      defaultValue={value}
      // No `lang` here on purpose. Fields that expect ASCII (BIP39 words, 0x addresses,
      // calldata) pass `lang="en"` so the keyboard starts in the right mode; wallet names
      // expect Chinese, and forcing English on those would break the keyboard for the
      // person the field is for.
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      onChange={(event) => {
        lastEmitted.current = event.target.value;
        onChange(event.target.value);
      }}
    />
  );
}

export function TextArea({
  value,
  onChange,
  ...rest
}: TextAreaProps & { value: string; onChange: (next: string) => void }): ReactNode {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const lastEmitted = useRef(value);
  useComposingSafeValue(value, ref, lastEmitted);
  return (
    <textarea
      {...rest}
      ref={ref}
      defaultValue={value}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      onChange={(event) => {
        lastEmitted.current = event.target.value;
        onChange(event.target.value);
      }}
    />
  );
}
