import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ScopePicker } from './ScopePicker';
import type { Collection } from '@app/shared';

afterEach(() => {
  cleanup();
});

const mockCollections: Collection[] = [
  {
    id: 'col-1',
    userId: 'user-1',
    name: 'Car Manuals',
    description: null,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'col-2',
    userId: 'user-1',
    name: 'Research Papers',
    description: null,
    createdAt: new Date().toISOString(),
  },
];

describe('ScopePicker', () => {
  it('renders trigger with "All collections" when none selected', () => {
    const handleSelect = vi.fn();
    render(
      <ScopePicker
        collections={mockCollections}
        selectedCollectionId={null}
        onSelectCollection={handleSelect}
      />,
    );

    const trigger = screen.getByRole('button', { name: /Filter context by collection/i });
    expect(trigger).toBeDefined();
    expect(screen.getByText('All collections')).toBeDefined();
  });

  it('renders trigger with selected collection name', () => {
    const handleSelect = vi.fn();
    render(
      <ScopePicker
        collections={mockCollections}
        selectedCollectionId="col-1"
        onSelectCollection={handleSelect}
      />,
    );

    expect(screen.getByText('Car Manuals')).toBeDefined();
  });

  it('opens popover listbox on click and selects an item', () => {
    const handleSelect = vi.fn();
    render(
      <ScopePicker
        collections={mockCollections}
        selectedCollectionId={null}
        onSelectCollection={handleSelect}
      />,
    );

    const trigger = screen.getByRole('button', { name: /Filter context by collection/i });
    fireEvent.click(trigger);

    expect(screen.getByRole('listbox')).toBeDefined();
    const options = screen.getAllByRole('option');
    expect(options.length).toBe(3); // All collections + 2 items

    fireEvent.click(screen.getByText('Research Papers'));
    expect(handleSelect).toHaveBeenCalledWith('col-2');
  });

  it('supports keyboard navigation with Arrow keys and Escape', () => {
    const handleSelect = vi.fn();
    render(
      <ScopePicker
        collections={mockCollections}
        selectedCollectionId={null}
        onSelectCollection={handleSelect}
      />,
    );

    const trigger = screen.getByRole('button', { name: /Filter context by collection/i });
    // Open with ArrowDown
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(screen.getByRole('listbox')).toBeDefined();

    // Close with Escape
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('is disabled when disabled prop is true', () => {
    const handleSelect = vi.fn();
    render(
      <ScopePicker
        collections={mockCollections}
        selectedCollectionId="col-1"
        onSelectCollection={handleSelect}
        disabled={true}
      />,
    );

    const trigger = screen.getByRole('button', { name: /Filter context by collection/i });
    expect((trigger as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(trigger);
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
