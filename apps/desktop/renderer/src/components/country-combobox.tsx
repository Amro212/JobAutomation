import * as React from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';

import { FILTER_COUNTRIES } from '@jobautomation/core';
import { cn } from '@renderer/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command';

/**
 * Single-select country combobox: type-to-search + click-to-select dropdown.
 *
 * `value` is an ISO 3166-1 alpha-2 code (e.g. "US") or empty string for "unset".
 */
export function CountryCombobox({
  value,
  onValueChange,
  placeholder = 'Select country…',
  emptyLabel = 'Not set',
  id,
  className,
  triggerClassName
}: {
  value: string;
  onValueChange: (code: string) => void;
  placeholder?: string;
  emptyLabel?: string;
  id?: string;
  className?: string;
  triggerClassName?: string;
}) {
  const [open, setOpen] = React.useState(false);

  const selectedCountry = React.useMemo(
    () => FILTER_COUNTRIES.find((c) => c.code === value),
    [value]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          id={id}
          className={cn(
            'w-full justify-between h-10 text-xs font-medium bg-background/50 rounded-xl border-border hover:bg-background/70',
            !selectedCountry && 'text-muted-foreground',
            triggerClassName
          )}
        >
          {selectedCountry ? selectedCountry.label : emptyLabel}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn('w-[--radix-popover-trigger-width] p-0', className)} align="start">
        <Command>
          <CommandInput placeholder={placeholder} />
          <CommandList>
            <CommandEmpty>No country found.</CommandEmpty>
            <CommandGroup>
              {/* "Not set" clearing option */}
              <CommandItem
                value="__clear__"
                keywords={['not set', 'clear', 'none']}
                onSelect={() => {
                  onValueChange('');
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    'mr-2 h-4 w-4',
                    value === '' ? 'opacity-100' : 'opacity-0'
                  )}
                />
                <span className="text-muted-foreground italic">{emptyLabel}</span>
              </CommandItem>

              {FILTER_COUNTRIES.map((country) => (
                <CommandItem
                  key={country.code}
                  value={country.code}
                  keywords={[country.label, country.code]}
                  onSelect={() => {
                    onValueChange(country.code === value ? '' : country.code);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      value === country.code ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  {country.label}
                  <span className="ml-auto text-muted-foreground text-[10px]">
                    {country.code}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Multi-select country combobox: type-to-search + click-to-toggle dropdown.
 * Shows selected country codes as comma-separated badges in the trigger.
 *
 * `value` is an array of ISO 3166-1 alpha-2 codes.
 */
export function CountryMultiCombobox({
  value,
  onValueChange,
  placeholder = 'Select countries…',
  id,
  className,
  triggerClassName
}: {
  value: string[];
  onValueChange: (codes: string[]) => void;
  placeholder?: string;
  id?: string;
  className?: string;
  triggerClassName?: string;
}) {
  const [open, setOpen] = React.useState(false);

  const selectedSet = React.useMemo(() => new Set(value), [value]);

  const label = React.useMemo(() => {
    if (value.length === 0) return placeholder;
    return value
      .map((code) => {
        const entry = FILTER_COUNTRIES.find((c) => c.code === code);
        return entry ? entry.label : code;
      })
      .join(', ');
  }, [value, placeholder]);

  const toggle = (code: string) => {
    const next = selectedSet.has(code)
      ? value.filter((c) => c !== code)
      : [...value, code];
    onValueChange(next);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          id={id}
          className={cn(
            'w-full justify-between h-10 text-xs font-medium bg-background/50 rounded-xl border-border hover:bg-background/70 truncate',
            value.length === 0 && 'text-muted-foreground',
            triggerClassName
          )}
        >
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn('w-[--radix-popover-trigger-width] p-0', className)} align="start">
        <Command>
          <CommandInput placeholder="Search countries…" />
          <CommandList>
            <CommandEmpty>No country found.</CommandEmpty>
            <CommandGroup>
              {FILTER_COUNTRIES.map((country) => (
                <CommandItem
                  key={country.code}
                  value={country.code}
                  keywords={[country.label, country.code]}
                  onSelect={() => toggle(country.code)}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      selectedSet.has(country.code) ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  {country.label}
                  <span className="ml-auto text-muted-foreground text-[10px]">
                    {country.code}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
