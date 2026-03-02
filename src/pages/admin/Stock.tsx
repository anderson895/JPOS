import { useState, useEffect } from 'react';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc, orderBy, query
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import type { InventoryItem, StockMovement } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import {
  Plus, Search, Edit2, Trash2, X, AlertTriangle, Package,
  TrendingUp, TrendingDown, RefreshCw, Loader2, History
} from 'lucide-react';
import toast from 'react-hot-toast';

const UNITS = ['kg', 'g', 'L', 'mL', 'pcs', 'pack', 'box', 'bag', 'bottle', 'sachet'];

const defaultItem: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'> = {
  name: '', unit: 'pcs', quantity: 0, minStock: 5, maxStock: 100, cost: 0
};

export default function AdminStock() {
  const { currentUser } = useAuth();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<Partial<InventoryItem>>(defaultItem);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [adjustModal, setAdjustModal] = useState<InventoryItem | null>(null);
  const [adjustQty, setAdjustQty] = useState(0);
  const [adjustType, setAdjustType] = useState<'in' | 'out' | 'adjustment'>('in');
  const [adjustReason, setAdjustReason] = useState('');
  const [historyModal, setHistoryModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'low' | 'out'>('all');

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    try {
      const [itemSnap, movSnap] = await Promise.all([
        getDocs(collection(db, 'inventory')),
        getDocs(query(collection(db, 'stockMovements'), orderBy('createdAt', 'desc'))),
      ]);
      setItems(itemSnap.docs.map(d => ({ id: d.id, ...d.data() } as InventoryItem)));
      setMovements(movSnap.docs.map(d => ({ id: d.id, ...d.data() } as StockMovement)));
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!editItem.name) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      const data = {
        name: editItem.name,
        unit: editItem.unit || 'pcs',
        quantity: Number(editItem.quantity || 0),
        minStock: Number(editItem.minStock || 0),
        maxStock: Number(editItem.maxStock || 100),
        cost: Number(editItem.cost || 0),
        supplierName: editItem.supplierName || '',
        updatedAt: new Date().toISOString(),
      };
      if (editId) {
        await updateDoc(doc(db, 'inventory', editId), data);
        toast.success('Item updated');
      } else {
        await addDoc(collection(db, 'inventory'), { ...data, createdAt: new Date().toISOString() });
        toast.success('Item added');
      }
      setModalOpen(false);
      setEditId(null);
      setEditItem(defaultItem);
      fetchAll();
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this item?')) return;
    try {
      await deleteDoc(doc(db, 'inventory', id));
      setItems(prev => prev.filter(i => i.id !== id));
      toast.success('Item deleted');
    } catch { toast.error('Failed to delete'); }
  }

  async function handleAdjust() {
    if (!adjustModal || !adjustQty) { toast.error('Enter a quantity'); return; }
    setSaving(true);
    try {
      const newQty = adjustType === 'in'
        ? adjustModal.quantity + adjustQty
        : adjustType === 'out'
          ? Math.max(0, adjustModal.quantity - adjustQty)
          : adjustQty;

      await updateDoc(doc(db, 'inventory', adjustModal.id), {
        quantity: newQty,
        lastRestocked: adjustType === 'in' ? new Date().toISOString() : (adjustModal.lastRestocked || ''),
        updatedAt: new Date().toISOString(),
      });

      const movement: Omit<StockMovement, 'id'> = {
        itemId: adjustModal.id,
        itemName: adjustModal.name,
        type: adjustType,
        quantity: adjustQty,
        previousQuantity: adjustModal.quantity,
        newQuantity: newQty,
        reason: adjustReason || 'Manual adjustment',
        performedBy: currentUser?.id || '',
        performedByName: currentUser?.displayName || '',
        createdAt: new Date().toISOString(),
      };
      await addDoc(collection(db, 'stockMovements'), movement);

      toast.success('Stock updated');
      setAdjustModal(null);
      setAdjustQty(0);
      setAdjustReason('');
      fetchAll();
    } catch { toast.error('Failed to adjust stock'); }
    finally { setSaving(false); }
  }

  const filtered = items.filter(i => {
    const matchSearch = i.name.toLowerCase().includes(search.toLowerCase());
    const matchTab = activeTab === 'all' || (activeTab === 'low' && i.quantity <= i.minStock && i.quantity > 0) || (activeTab === 'out' && i.quantity === 0);
    return matchSearch && matchTab;
  });

  const lowCount = items.filter(i => i.quantity <= i.minStock && i.quantity > 0).length;
  const outCount = items.filter(i => i.quantity === 0).length;

  function stockPercent(item: InventoryItem) {
    return Math.min(100, Math.round((item.quantity / item.maxStock) * 100));
  }

  function stockColor(item: InventoryItem) {
    const pct = stockPercent(item);
    if (pct === 0) return 'bg-red-500';
    if (pct < 25) return 'bg-amber-500';
    return 'bg-emerald-500';
  }

  return (
    <div className="p-8 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-espresso-900">Stock Management</h1>
          <p className="text-bark-500 text-sm mt-0.5">{items.length} inventory items</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setHistoryModal(true)} className="btn-secondary flex items-center gap-2">
            <History className="w-4 h-4" /> History
          </button>
          <button onClick={() => { setEditItem(defaultItem); setEditId(null); setModalOpen(true); }} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Item
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4 flex items-center gap-4">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
            <Package className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-2xl font-display font-semibold text-espresso-900">{items.length}</p>
            <p className="text-xs text-bark-500">Total Items</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-4">
          <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <p className="text-2xl font-display font-semibold text-espresso-900">{lowCount}</p>
            <p className="text-xs text-bark-500">Low Stock</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-4">
          <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <p className="text-2xl font-display font-semibold text-espresso-900">{outCount}</p>
            <p className="text-xs text-bark-500">Out of Stock</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-bark-400" />
          <input className="input pl-9" placeholder="Search inventory..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1 bg-cream-100 p-1 rounded-xl">
          {(['all', 'low', 'out'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab ? 'bg-white text-espresso-800 shadow-sm' : 'text-bark-500 hover:text-bark-700'
              }`}
            >
              {tab === 'all' ? 'All' : tab === 'low' ? `Low (${lowCount})` : `Out (${outCount})`}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-cream-50 border-b border-cream-100">
            <tr>
              <th className="table-header">Item</th>
              <th className="table-header">Quantity</th>
              <th className="table-header">Stock Level</th>
              <th className="table-header">Min/Max</th>
              <th className="table-header">Unit Cost</th>
              <th className="table-header">Status</th>
              <th className="table-header">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i}><td colSpan={7} className="px-4 py-3"><div className="h-4 bg-cream-100 rounded animate-pulse" /></td></tr>
              ))
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-bark-400">
                <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No items found</p>
              </td></tr>
            ) : filtered.map(item => (
              <tr key={item.id} className="table-row">
                <td className="table-cell font-medium text-espresso-800">{item.name}</td>
                <td className="table-cell font-mono font-semibold">
                  {item.quantity} <span className="text-bark-400 font-body text-xs">{item.unit}</span>
                </td>
                <td className="table-cell w-32">
                  <div className="w-full h-2 bg-cream-200 rounded-full">
                    <div
                      className={`h-2 rounded-full transition-all ${stockColor(item)}`}
                      style={{ width: `${stockPercent(item)}%` }}
                    />
                  </div>
                  <p className="text-xs text-bark-400 mt-1">{stockPercent(item)}%</p>
                </td>
                <td className="table-cell text-xs text-bark-500">{item.minStock} / {item.maxStock}</td>
                <td className="table-cell">{formatCurrency(item.cost)}</td>
                <td className="table-cell">
                  {item.quantity === 0
                    ? <span className="badge badge-danger">Out of Stock</span>
                    : item.quantity <= item.minStock
                      ? <span className="badge badge-warning">Low Stock</span>
                      : <span className="badge badge-success">In Stock</span>
                  }
                </td>
                <td className="table-cell">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { setAdjustModal(item); setAdjustQty(0); setAdjustType('in'); }}
                      className="w-7 h-7 bg-espresso-50 hover:bg-espresso-100 rounded-lg flex items-center justify-center text-espresso-700 transition-colors"
                      title="Adjust stock"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => { setEditItem({ ...item }); setEditId(item.id); setModalOpen(true); }}
                      className="w-7 h-7 bg-cream-100 hover:bg-cream-200 rounded-lg flex items-center justify-center text-bark-600 transition-colors"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="w-7 h-7 bg-red-50 hover:bg-red-100 rounded-lg flex items-center justify-center text-red-500 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-cream-100">
              <h2 className="font-display text-xl text-espresso-900">{editId ? 'Edit Item' : 'Add Inventory Item'}</h2>
              <button onClick={() => setModalOpen(false)}><X className="w-5 h-5 text-bark-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="label">Item Name *</label>
                <input className="input" placeholder="e.g., Coffee Beans" value={editItem.name || ''} onChange={e => setEditItem(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Unit</label>
                  <select className="input" value={editItem.unit || 'pcs'} onChange={e => setEditItem(p => ({ ...p, unit: e.target.value }))}>
                    {UNITS.map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Current Quantity</label>
                  <input className="input" type="number" min="0" value={editItem.quantity ?? ''} onChange={e => setEditItem(p => ({ ...p, quantity: Number(e.target.value) }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Min Stock</label>
                  <input className="input" type="number" min="0" value={editItem.minStock ?? ''} onChange={e => setEditItem(p => ({ ...p, minStock: Number(e.target.value) }))} />
                </div>
                <div>
                  <label className="label">Max Stock</label>
                  <input className="input" type="number" min="0" value={editItem.maxStock ?? ''} onChange={e => setEditItem(p => ({ ...p, maxStock: Number(e.target.value) }))} />
                </div>
              </div>
              <div>
                <label className="label">Unit Cost (₱)</label>
                <input className="input" type="number" min="0" step="0.01" value={editItem.cost ?? ''} onChange={e => setEditItem(p => ({ ...p, cost: Number(e.target.value) }))} />
              </div>
              <div>
                <label className="label">Supplier Name</label>
                <input className="input" placeholder="Optional" value={editItem.supplierName || ''} onChange={e => setEditItem(p => ({ ...p, supplierName: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-3 p-6 border-t border-cream-100">
              <button onClick={() => setModalOpen(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Adjust Modal */}
      {adjustModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between p-6 border-b border-cream-100">
              <h2 className="font-display text-xl text-espresso-900">Adjust Stock</h2>
              <button onClick={() => setAdjustModal(null)}><X className="w-5 h-5 text-bark-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-cream-50 rounded-xl p-3 text-sm">
                <p className="font-medium text-espresso-800">{adjustModal.name}</p>
                <p className="text-bark-500">Current: {adjustModal.quantity} {adjustModal.unit}</p>
              </div>
              <div>
                <label className="label">Adjustment Type</label>
                <div className="flex gap-2">
                  {(['in', 'out', 'adjustment'] as const).map(t => (
                    <button key={t} onClick={() => setAdjustType(t)}
                      className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${adjustType === t ? 'bg-espresso-600 text-white' : 'bg-cream-100 text-bark-600 hover:bg-cream-200'}`}>
                      {t === 'in' ? '+ Stock In' : t === 'out' ? '- Stock Out' : '= Set'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">Quantity ({adjustModal.unit})</label>
                <input className="input" type="number" min="0" value={adjustQty || ''} onChange={e => setAdjustQty(Number(e.target.value))} />
              </div>
              <div>
                <label className="label">Reason</label>
                <input className="input" placeholder="e.g., Restocking, damaged..." value={adjustReason} onChange={e => setAdjustReason(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-3 p-6 border-t border-cream-100">
              <button onClick={() => setAdjustModal(null)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={handleAdjust} disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {historyModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-cream-100">
              <h2 className="font-display text-xl text-espresso-900">Stock Movement History</h2>
              <button onClick={() => setHistoryModal(false)}><X className="w-5 h-5 text-bark-400" /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <table className="w-full">
                <thead className="bg-cream-50 sticky top-0">
                  <tr>
                    <th className="table-header">Item</th>
                    <th className="table-header">Type</th>
                    <th className="table-header">Qty</th>
                    <th className="table-header">Before → After</th>
                    <th className="table-header">By</th>
                    <th className="table-header">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map(m => (
                    <tr key={m.id} className="table-row">
                      <td className="table-cell font-medium">{m.itemName}</td>
                      <td className="table-cell">
                        <span className={`badge ${m.type === 'in' ? 'badge-success' : m.type === 'out' ? 'badge-danger' : 'badge-info'}`}>
                          {m.type === 'in' ? '+ In' : m.type === 'out' ? '- Out' : '= Set'}
                        </span>
                      </td>
                      <td className="table-cell font-mono">{m.quantity}</td>
                      <td className="table-cell text-xs text-bark-500">{m.previousQuantity} → {m.newQuantity}</td>
                      <td className="table-cell text-xs">{m.performedByName}</td>
                      <td className="table-cell text-xs text-bark-400">{formatDateTime(m.createdAt)}</td>
                    </tr>
                  ))}
                  {movements.length === 0 && (
                    <tr><td colSpan={6} className="text-center py-8 text-bark-400 text-sm">No movements recorded</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
