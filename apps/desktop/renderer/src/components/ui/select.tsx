import {
  Button,
  ListBox,
  ListBoxItem,
  Popover,
  Select as RASelect,
  SelectValue,
  type SelectProps as RASelectProps,
  type ListBoxItemProps
} from 'react-aria-components';

export interface SelectProps<T extends object> extends RASelectProps<T> {
  label?: string;
  items?: Iterable<T>;
  children: React.ReactNode | ((item: T) => React.ReactNode);
}

export function Select<T extends object>({ label, children, items, ...props }: SelectProps<T>) {
  return (
    <RASelect {...props} className="flex flex-col gap-2 w-full">
      {label && <span className="text-sm text-muted-foreground">{label}</span>}
      <Button className="flex h-10 w-full items-center justify-between rounded-xl border border-border bg-black/20 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
        <SelectValue className="truncate" />
        <span aria-hidden="true">▼</span>
      </Button>
      <Popover className="w-[--trigger-width] overflow-auto rounded-xl border border-border bg-popover/80 backdrop-blur-xl text-popover-foreground shadow-[0_8px_32px_rgba(0,0,0,0.4)] entering:animate-in entering:fade-in exiting:animate-out exiting:fade-out">
        <ListBox items={items} className="p-1 outline-none">
          {children}
        </ListBox>
      </Popover>
    </RASelect>
  );
}

export function SelectItem(props: ListBoxItemProps) {
  return (
    <ListBoxItem
      {...props}
      className={({ isFocused, isSelected }) =>
        `relative flex w-full cursor-pointer select-none items-center rounded-lg py-2 pl-3 pr-9 text-sm outline-none transition-colors ${
          isFocused ? 'bg-white/10 text-white' : 'text-slate-300'
        } ${isSelected ? 'font-semibold text-sky-400' : ''}`
      }
    />
  );
}
