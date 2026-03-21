'use client';

import * as React from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export function CompanyNameCombobox({
  name,
  options,
  defaultValue,
  'aria-label': ariaLabel
}: {
  name: string;
  options: string[];
  defaultValue: string;
  'aria-label': string;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [selected, setSelected] = React.useState(defaultValue);

  React.useEffect(() => {
    setSelected(defaultValue);
  }, [defaultValue]);

  const q = query.trim().toLowerCase();
  const filtered = React.useMemo(
    () =>
      q.length === 0
        ? options
        : options.filter((o) => o.toLowerCase().includes(q)),
    [options, q]
  );

  const showUseTyped =
    query.trim().length > 0 &&
    !options.some((o) => o.toLowerCase() === query.trim().toLowerCase());

  return (
    <div className="space-y-0">
      <input type="hidden" name={name} value={selected} aria-hidden />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label={ariaLabel}
            className="h-9 w-full justify-between font-normal"
          >
            <span className={cn('truncate', !selected && 'text-muted-foreground')}>
              {selected || 'Any company'}
            </span>
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder="Search companies…" value={query} onValueChange={setQuery} />
            <CommandList>
              <CommandEmpty>No matching company.</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value="__clear__"
                  onSelect={() => {
                    setSelected('');
                    setOpen(false);
                    setQuery('');
                  }}
                >
                  <Check className={cn('mr-2 size-4', selected ? 'opacity-0' : 'opacity-100')} aria-hidden />
                  Any company
                </CommandItem>
                {filtered.map((company) => (
                  <CommandItem
                    key={company}
                    value={company}
                    onSelect={() => {
                      setSelected(company);
                      setOpen(false);
                      setQuery('');
                    }}
                  >
                    <Check
                      className={cn(
                        'mr-2 size-4',
                        selected === company ? 'opacity-100' : 'opacity-0'
                      )}
                      aria-hidden
                    />
                    {company}
                  </CommandItem>
                ))}
                {showUseTyped ? (
                  <CommandItem
                    value={`__typed__:${query.trim()}`}
                    onSelect={() => {
                      setSelected(query.trim());
                      setOpen(false);
                      setQuery('');
                    }}
                  >
                    Use &quot;{query.trim()}&quot; as filter
                  </CommandItem>
                ) : null}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
