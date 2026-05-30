import {
  TextField as RATextField,
  Label,
  Input,
  type TextFieldProps as RATextFieldProps
} from 'react-aria-components';

export interface TextFieldProps extends RATextFieldProps {
  label?: string;
  placeholder?: string;
}

export function TextField({ label, placeholder, ...props }: TextFieldProps) {
  return (
    <RATextField {...props} className="flex flex-col gap-2 w-full">
      {label && <Label className="text-sm text-muted-foreground">{label}</Label>}
      <Input
        placeholder={placeholder}
        className="flex h-10 w-full rounded-xl border border-border bg-black/20 px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-shadow"
      />
    </RATextField>
  );
}
