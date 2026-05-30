import { Checkbox as RACheckbox, type CheckboxProps as RACheckboxProps } from 'react-aria-components';

export interface CheckboxProps extends RACheckboxProps {
  children?: React.ReactNode;
}

export function Checkbox({ children, ...props }: CheckboxProps) {
  return (
    <RACheckbox
      {...props}
      className={({ isFocusVisible, isSelected, isDisabled }) =>
        `group flex items-center gap-3 text-sm transition-colors ${
          isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:text-sky-50'
        } ${isFocusVisible ? 'ring-2 ring-primary ring-offset-2 ring-offset-background outline-none rounded' : ''}`
      }
    >
      {({ isSelected, isIndeterminate }) => (
        <>
          <div
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-all ${
              isSelected || isIndeterminate
                ? 'bg-primary border-primary text-primary-foreground shadow-[0_2px_10px_rgba(59,130,246,0.3)]'
                : 'border-border bg-black/20'
            }`}
          >
            {(isSelected || isIndeterminate) && (
              <svg viewBox="0 0 18 18" aria-hidden="true" className="w-3.5 h-3.5 stroke-current stroke-[3] fill-none">
                {isIndeterminate ? (
                  <path d="M4 9h10" />
                ) : (
                  <polyline points="4 9 8 13 14 5" />
                )}
              </svg>
            )}
          </div>
          {children}
        </>
      )}
    </RACheckbox>
  );
}
