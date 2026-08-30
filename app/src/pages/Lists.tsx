import {
  ArrowDown,
  ArrowUp,
  Archive,
  Check,
  ListChecks,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import {
  type FormEvent,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useHouseholdProfile } from '../household/useHouseholdProfile';
import { useLists } from '../hooks/useLists';
import { selectActiveLists } from '../lists/listSelectors';
import type {
  FamilyList,
  FamilyListItem,
} from '../types/familyList';

import './Lists.css';

type Direction = -1 | 1;

function movedIds<T extends { id: string }>(
  values: T[],
  id: string,
  direction: Direction
): string[] {
  const ids = values.map(value => value.id);
  const index = ids.indexOf(id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= ids.length) return ids;
  [ids[index], ids[target]] = [ids[target], ids[index]];
  return ids;
}

function movedItemIds(
  items: FamilyListItem[],
  itemId: string,
  checked: boolean,
  direction: Direction
): string[] {
  const subset = items.filter(item => (item.checkedAt !== null) === checked);
  const reorderedSubset = movedIds(subset, itemId, direction);
  let subsetIndex = 0;
  return items.map(item => {
    if ((item.checkedAt !== null) !== checked) return item.id;
    return reorderedSubset[subsetIndex++];
  });
}

type ItemRowProps = {
  item: FamilyListItem;
  list: FamilyList;
  position: number;
  count: number;
  saving: boolean;
  editing: boolean;
  editTitle: string;
  onEditTitle: (title: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (event: FormEvent) => void;
  onCheck: (checked: boolean) => void;
  onMove: (direction: Direction) => void;
  onRemove: () => void;
};

function ItemRow({
  item,
  list,
  position,
  count,
  saving,
  editing,
  editTitle,
  onEditTitle,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onCheck,
  onMove,
  onRemove,
}: ItemRowProps) {
  const isChecked = item.checkedAt !== null;
  return (
    <li className={`lists-item ${isChecked ? 'lists-item--checked' : ''}`}>
      <label className="lists-item__check">
        <input
          type="checkbox"
          checked={isChecked}
          disabled={saving}
          onChange={event => onCheck(event.target.checked)}
        />
        <span className="lists-item__custom-check" aria-hidden="true">
          {isChecked && <Check size={18} />}
        </span>
        <span className="lists-item__title">{item.title}</span>
      </label>

      {editing ? (
        <form className="lists-inline-editor" onSubmit={onSaveEdit}>
          <label className="lists-sr-only" htmlFor={`edit-item-${item.id}`}>
            Edit {item.title}
          </label>
          <input
            id={`edit-item-${item.id}`}
            value={editTitle}
            maxLength={160}
            disabled={saving}
            autoFocus
            onChange={event => onEditTitle(event.target.value)}
          />
          <button type="submit" className="lists-icon-button" disabled={saving} aria-label="Save item">
            <Check size={18} />
          </button>
          <button type="button" className="lists-icon-button" disabled={saving} onClick={onCancelEdit} aria-label="Cancel item edit">
            <X size={18} />
          </button>
        </form>
      ) : (
        <div className="lists-item__actions">
          <button type="button" className="lists-icon-button" disabled={saving || position === 0} onClick={() => onMove(-1)} aria-label={`Move ${item.title} up in ${list.name}`}>
            <ArrowUp size={18} />
          </button>
          <button type="button" className="lists-icon-button" disabled={saving || position === count - 1} onClick={() => onMove(1)} aria-label={`Move ${item.title} down in ${list.name}`}>
            <ArrowDown size={18} />
          </button>
          <button type="button" className="lists-icon-button" disabled={saving} onClick={onStartEdit} aria-label={`Edit ${item.title}`}>
            <Pencil size={18} />
          </button>
          <button type="button" className="lists-icon-button lists-icon-button--danger" disabled={saving} onClick={onRemove} aria-label={`Remove ${item.title} from ${list.name}`}>
            <Trash2 size={18} />
          </button>
        </div>
      )}
    </li>
  );
}

function Lists() {
  const {
    store,
    loading,
    saving,
    error,
    refresh,
    createList,
    renameList,
    setListActive,
    reorderLists,
    createItem,
    editItem,
    setItemChecked,
    removeItem,
    reorderItems,
    clearChecked,
  } = useLists();
  const { selectedProfileId } = useHouseholdProfile();

  const activeLists = useMemo(() => selectActiveLists(store), [store]);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const selectedList = activeLists.find(list => list.id === selectedListId) ??
    activeLists.find(list => list.systemKey === 'shopping') ??
    activeLists[0] ?? null;

  const [itemTitle, setItemTitle] = useState('');
  const itemInputRef = useRef<HTMLInputElement>(null);
  const pendingItemRef = useRef<{
    id: string;
    listId: string;
    title: string;
    profileId: string;
  } | null>(null);
  const [newListName, setNewListName] = useState('');
  const pendingListRef = useRef<{ id: string; name: string } | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItemTitle, setEditingItemTitle] = useState('');
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [editingListName, setEditingListName] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  const activeItems = selectedList?.items.filter(item => item.checkedAt === null) ?? [];
  const checkedItems = selectedList?.items.filter(item => item.checkedAt !== null) ?? [];

  const submitItem = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedList || !itemTitle.trim() || saving) return;
    const normalizedTitle = itemTitle.trim();
    const pending = pendingItemRef.current;
    const request = pending &&
      pending.listId === selectedList.id &&
      pending.title === normalizedTitle &&
      pending.profileId === selectedProfileId
      ? pending
      : {
        id: crypto.randomUUID(),
        listId: selectedList.id,
        title: normalizedTitle,
        profileId: selectedProfileId,
      };
    pendingItemRef.current = request;
    try {
      await createItem(request.listId, {
        id: request.id,
        title: request.title,
        addedByProfileId: request.profileId,
      });
      pendingItemRef.current = null;
      setItemTitle('');
      setStatusMessage(`${request.title} added to ${selectedList.name}.`);
      window.setTimeout(() => itemInputRef.current?.focus(), 0);
    } catch {
      // Keep the deterministic request ID and input for a safe retry.
    }
  };

  const submitNewList = async (event: FormEvent) => {
    event.preventDefault();
    if (!newListName.trim() || saving) return;
    const normalizedName = newListName.trim();
    const pending = pendingListRef.current;
    const request = pending?.name === normalizedName
      ? pending
      : { id: crypto.randomUUID(), name: normalizedName };
    pendingListRef.current = request;
    try {
      await createList(request);
      pendingListRef.current = null;
      setNewListName('');
      setSelectedListId(request.id);
      setStatusMessage(`${request.name} created.`);
    } catch {
      // Keep the deterministic request ID for a safe retry.
    }
  };

  const submitItemEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedList || !editingItemId || !editingItemTitle.trim()) return;
    try {
      await editItem(selectedList.id, editingItemId, editingItemTitle);
      setEditingItemId(null);
      setStatusMessage('Item updated.');
    } catch {
      // The shared error banner reports the failure.
    }
  };

  const submitListRename = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingListId || !editingListName.trim()) return;
    try {
      await renameList(editingListId, editingListName);
      setEditingListId(null);
      setStatusMessage('List renamed.');
    } catch {
      // The shared error banner reports the failure.
    }
  };

  const moveList = async (listId: string, direction: Direction) => {
    try {
      await reorderLists(movedIds(store.lists, listId, direction));
      setStatusMessage('List order updated.');
    } catch {
      // Stale orders are surfaced by the shared error banner.
    }
  };

  const moveItem = async (
    item: FamilyListItem,
    checked: boolean,
    direction: Direction
  ) => {
    if (!selectedList) return;
    try {
      await reorderItems(
        selectedList.id,
        movedItemIds(selectedList.items, item.id, checked, direction)
      );
      setStatusMessage('Item order updated.');
    } catch {
      // Stale orders are surfaced by the shared error banner.
    }
  };

  const renderItems = (items: FamilyListItem[], checked: boolean) => (
    <ul className="lists-items">
      {items.map((item, index) => (
        <ItemRow
          key={item.id}
          item={item}
          list={selectedList!}
          position={index}
          count={items.length}
          saving={saving}
          editing={editingItemId === item.id}
          editTitle={editingItemTitle}
          onEditTitle={setEditingItemTitle}
          onStartEdit={() => {
            setEditingItemId(item.id);
            setEditingItemTitle(item.title);
          }}
          onCancelEdit={() => setEditingItemId(null)}
          onSaveEdit={submitItemEdit}
          onCheck={desired => {
            void setItemChecked(selectedList!.id, item.id, desired)
              .then(() => setStatusMessage(
                desired ? `${item.title} checked.` : `${item.title} returned to the list.`
              ))
              .catch(() => undefined);
          }}
          onMove={direction => void moveItem(item, checked, direction)}
          onRemove={() => {
            void removeItem(selectedList!.id, item.id)
              .then(() => setStatusMessage(`${item.title} removed.`))
              .catch(() => undefined);
          }}
        />
      ))}
    </ul>
  );

  return (
    <main className="lists-page">
      <header className="lists-page__header">
        <div>
          <p className="lists-page__eyebrow">Family Lists</p>
          <h1>Lists</h1>
          <p>Keep shared household essentials together.</p>
        </div>
        <ListChecks size={34} aria-hidden="true" />
      </header>

      {error && (
        <div className="lists-message lists-message--error" role="alert">
          <span>{error}</span>
          <button type="button" className="lists-button lists-button--secondary" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw size={18} aria-hidden="true" /> Retry
          </button>
        </div>
      )}
      <p className="lists-sr-status" role="status" aria-live="polite">
        {statusMessage}
      </p>

      {loading ? (
        <section className="lists-panel" aria-busy="true">
          <p className="lists-empty">Loading Lists…</p>
        </section>
      ) : (
        <>
          {activeLists.length > 0 && (
            <nav className="lists-tabs" aria-label="Active lists">
              {activeLists.map(list => (
                <button
                  key={list.id}
                  type="button"
                  className={list.id === selectedList?.id ? 'is-active' : ''}
                  onClick={() => setSelectedListId(list.id)}
                  aria-current={list.id === selectedList?.id ? 'page' : undefined}
                >
                  {list.name}
                </button>
              ))}
            </nav>
          )}

          <section className="lists-panel lists-workspace">
            {selectedList ? (
              <>
                <div className="lists-section-heading">
                  <div>
                    <h2>{selectedList.name}</h2>
                    <p>{activeItems.length} unchecked · {checkedItems.length} checked</p>
                  </div>
                </div>

                <form className="lists-quick-add" onSubmit={submitItem}>
                  <label className="lists-sr-only" htmlFor="lists-quick-add-input">
                    Add item to {selectedList.name}
                  </label>
                  <input
                    ref={itemInputRef}
                    id="lists-quick-add-input"
                    value={itemTitle}
                    maxLength={160}
                    placeholder={`Add to ${selectedList.name}…`}
                    disabled={saving}
                    onChange={event => {
                      setItemTitle(event.target.value);
                      if (pendingItemRef.current?.title !== event.target.value.trim()) {
                        pendingItemRef.current = null;
                      }
                    }}
                  />
                  <button type="submit" className="lists-button lists-button--primary" disabled={saving || !itemTitle.trim()}>
                    <Plus size={20} aria-hidden="true" /> Add
                  </button>
                </form>

                {activeItems.length > 0
                  ? renderItems(activeItems, false)
                  : <p className="lists-empty">Nothing needed yet. Add the first item above.</p>}

                {checkedItems.length > 0 && (
                  <details className="lists-checked">
                    <summary>Checked ({checkedItems.length})</summary>
                    {renderItems(checkedItems, true)}
                    <button
                      type="button"
                      className="lists-button lists-button--danger lists-clear-checked"
                      disabled={saving}
                      onClick={() => {
                        if (!window.confirm(
                          `Permanently remove ${checkedItems.length} checked ${checkedItems.length === 1 ? 'item' : 'items'} from ${selectedList.name}?`
                        )) return;
                        void clearChecked(selectedList.id)
                          .then(() => setStatusMessage(
                            `${checkedItems.length} checked ${checkedItems.length === 1 ? 'item' : 'items'} removed.`
                          ))
                          .catch(() => undefined);
                      }}
                    >
                      <Trash2 size={18} aria-hidden="true" /> Clear checked
                    </button>
                  </details>
                )}
              </>
            ) : (
              <p className="lists-empty">No active lists. Reactivate one in Manage Lists.</p>
            )}
          </section>

          <details className="lists-panel lists-manage">
            <summary>Manage Lists</summary>
            <form className="lists-create-list" onSubmit={submitNewList}>
              <label htmlFor="new-list-name">New list</label>
              <div>
                <input
                  id="new-list-name"
                  value={newListName}
                  maxLength={60}
                  placeholder="School, Packing…"
                  disabled={saving}
                  onChange={event => {
                    setNewListName(event.target.value);
                    if (pendingListRef.current?.name !== event.target.value.trim()) {
                      pendingListRef.current = null;
                    }
                  }}
                />
                <button type="submit" className="lists-button lists-button--primary" disabled={saving || !newListName.trim()}>
                  <Plus size={18} aria-hidden="true" /> Create list
                </button>
              </div>
            </form>

            <ul className="lists-manage-list">
              {store.lists.map((list, index) => (
                <li key={list.id} className={!list.active ? 'is-archived' : ''}>
                  {editingListId === list.id ? (
                    <form className="lists-inline-editor lists-inline-editor--list" onSubmit={submitListRename}>
                      <label className="lists-sr-only" htmlFor={`rename-list-${list.id}`}>Rename {list.name}</label>
                      <input
                        id={`rename-list-${list.id}`}
                        value={editingListName}
                        maxLength={60}
                        disabled={saving}
                        autoFocus
                        onChange={event => setEditingListName(event.target.value)}
                      />
                      <button type="submit" className="lists-icon-button" disabled={saving} aria-label="Save list name"><Check size={18} /></button>
                      <button type="button" className="lists-icon-button" disabled={saving} onClick={() => setEditingListId(null)} aria-label="Cancel list rename"><X size={18} /></button>
                    </form>
                  ) : (
                    <div className="lists-manage-list__identity">
                      <strong>{list.name}</strong>
                      <span>{list.systemKey === 'shopping' ? 'Shopping system list' : list.active ? 'Active' : 'Archived'}</span>
                    </div>
                  )}
                  <div className="lists-manage-list__actions">
                    <button type="button" className="lists-icon-button" disabled={saving || index === 0} onClick={() => void moveList(list.id, -1)} aria-label={`Move ${list.name} up`}><ArrowUp size={18} /></button>
                    <button type="button" className="lists-icon-button" disabled={saving || index === store.lists.length - 1} onClick={() => void moveList(list.id, 1)} aria-label={`Move ${list.name} down`}><ArrowDown size={18} /></button>
                    <button type="button" className="lists-button lists-button--secondary" disabled={saving} onClick={() => {
                      setEditingListId(list.id);
                      setEditingListName(list.name);
                    }}><Pencil size={18} aria-hidden="true" /> Rename</button>
                    <button type="button" className="lists-button lists-button--secondary" disabled={saving} onClick={() => {
                      void setListActive(list.id, !list.active)
                        .then(() => setStatusMessage(
                          list.active ? `${list.name} archived.` : `${list.name} reactivated.`
                        ))
                        .catch(() => undefined);
                    }}>
                      {list.active ? <Archive size={18} aria-hidden="true" /> : <RotateCcw size={18} aria-hidden="true" />}
                      {list.active ? 'Archive' : 'Reactivate'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </main>
  );
}

export default Lists;
