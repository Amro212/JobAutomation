import { Button as ReactAriaButton, type ButtonProps as ReactAriaButtonProps } from 'react-aria-components';

export interface ButtonProps extends ReactAriaButtonProps {
  variant?: 'default' | 'secondary' | 'ghost';
}

export function Button({ variant = 'default', ...props }: ButtonProps) {
  return (
    <ReactAriaButton
      {...props}
      data-variant={variant}
    />
  );
}
