'use client';

import * as React from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';

import { FILTER_COUNTRIES } from '@jobautomation/core';
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

export function LocationCountryCombobox({
  name,
  defaultValue,
  'aria-label': ariaLabel
}: {
  name: string;
  defaultValue: string[];
  'aria-label': string;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [selected, setSelected] = React.useState<Set<string>>(new Set(defaultValue));

  React.useEffect(() => {
    setSelected(new Set(defaultValue));
  }, [defaultValue]);

  const q = query.trim().toLowerCase();
  const filtered = React.useMemo(
    () =>
      q.length === 0
        ? FILTER_COUNTRIES
        : FILTER_COUNTRIES.filter(
            (c) =>
              c.label.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
          ),
    [q]
  );

  function toggle(code: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  }

  const selectedArray = Array.from(selected);
  const selectedLabels = selectedArray
    .map((code) => FILTER_COUNTRIES.find((c) => c.code === code)?.label ?? code)
    .slice(0, 3);

  const displayText =
    selectedArray.length === 0
      ? 'Any country'
      : selectedLabels.join(', ') + (selectedArray.length > 3 ? ` +${selectedArray.length - 3}` : '');

  return (
    <div className="space-y-0">
      {selectedArray.map((code) => (
        <input key={code} type="hidden" name={name} value={code} />
      ))}
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
            <span
              className={cn(
                'truncate',
                selectedArray.length === 0 && 'text-muted-foreground'
              )}
            >
              {displayText}
            </span>
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[240px] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search countries…"
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              <CommandEmpty>No matching country.</CommandEmpty>
              <CommandGroup>
                {selectedArray.length > 0 && (
                  <CommandItem
                    value="__clear_all__"
                    onSelect={() => {
                      setSelected(new Set());
                      setQuery('');
                    }}
                  >
                    <X className="mr-2 size-4 text-muted-foreground" aria-hidden />
                    Clear all
                  </CommandItem>
                )}
                {filtered.map((country) => (
                  <CommandItem
                    key={country.code}
                    value={country.code}
                    onSelect={() => toggle(country.code)}
                  >
                    <Check
                      className={cn(
                        'mr-2 size-4',
                        selected.has(country.code) ? 'opacity-100' : 'opacity-0'
                      )}
                      aria-hidden
                    />
                    {country.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
