import { useState, useEffect, useRef } from 'react';
import {
  getDocs, addDoc, updateDoc, deleteDoc
} from 'firebase/firestore';
import { tenantCol, tenantDoc } from '@/lib/tenant';
import { uploadImage } from '@/lib/cloudinary';
import { cn, formatCurrency } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { BUSINESS_UP, hasFeature } from '@/lib/entitlements';
import {
  DETAIL_FIELDS, DETAIL_LABEL, DETAIL_MAX, UNITS, UNIT_LABEL, mainDetailFields, matchesSearch, productDetails, sizeExample,
  type DetailField,
} from '@/lib/productDetails';
import Portal from '@/components/shared/Portal';
import PageHeader from '@/components/shared/PageHeader';
import DiscountsModal from '@/components/admin/DiscountsModal';
import type { Product, Category } from '@/types';
import {
  Plus, Search, Edit2, Trash2, X, Upload, ToggleLeft, ToggleRight, Loader2, Tag, Pencil, Package, ChevronDown, ScanBarcode, BadgePercent, Lock,
} from 'lucide-react';
import toast from 'react-hot-toast';

const defaultProduct: Omit<Product, 'id' | 'createdAt' | 'updatedAt'> = {
  name: '', description: '', price: 0, categoryId: '', categoryName: '',
  imageUrl: '', isAvailable: true, cost: 0, variants: [],
  brand: '', size: '', color: '', unit: '', sku: '',
};

export default function AdminProducts() {
  const { tenant } = useAuth();
  const canDiscounts = hasFeature(tenant, 'discounts');
  // The details this kind of store fills in first; the rest are under "More details"
  const mainFields = mainDetailFields(tenant?.businessType);
  const [moreDetails, setMoreDetails] = useState(false);
  const [products, setProducts]       = useState<Product[]>([]);
  const [categories, setCategories]   = useState<Category[]>([]);
  const [search, setSearch]           = useState('');
  const [filterCat, setFilterCat]     = useState('');
  const [loading, setLoading]         = useState(true);
  const [modalOpen, setModalOpen]     = useState(false);
  const [editProduct, setEditProduct] = useState<Partial<Product>>(defaultProduct);
  const [editId, setEditId]           = useState<string | null>(null);
  const [saving, setSaving]           = useState(false);
  const [imgUploading, setImgUploading] = useState(false);
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [discountsOpen, setDiscountsOpen] = useState(false);
  const [newCatName, setNewCatName]   = useState('');
  // Category edit/delete state
  const [editCatId, setEditCatId]     = useState<string | null>(null);
  const [editCatName, setEditCatName] = useState('');
  const [savingCat, setSavingCat]     = useState(false);
  // The product or category being deleted or switched on/off (its button shows a spinner)
  const [busyId, setBusyId]           = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    try {
      const [prodSnap, catSnap] = await Promise.all([
        getDocs(tenantCol('products')),
        getDocs(tenantCol('categories')),
      ]);
      setProducts(prodSnap.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
      setCategories(catSnap.docs.map(d => ({ id: d.id, ...d.data() } as Category)));
    } catch (err) {
      console.error(err);
      toast.error('Failed to load products');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    const name  = editProduct.name?.trim() || '';
    const price = Number(editProduct.price);
    const cost  = Number(editProduct.cost || 0);
    if (!name || !(price > 0)) {
      toast.error('Name and a price above ₱0 are required'); return;
    }
    if (!(cost >= 0)) {
      toast.error('Cost cannot be negative'); return;
    }
    const sku = editProduct.sku?.trim() || '';
    const sameCode = sku ? products.find(p => p.id !== editId && p.sku?.trim().toLowerCase() === sku.toLowerCase()) : undefined;
    if (sameCode) {
      toast.error(`"${sameCode.name}" already uses this barcode or code.`); return;
    }
    setSaving(true);
    try {
      const cat = categories.find(c => c.id === editProduct.categoryId);
      const data = {
        name,
        description: editProduct.description || '',
        price,
        cost,
        categoryId: editProduct.categoryId || '',
        categoryName: cat?.name || '',
        imageUrl: editProduct.imageUrl || '',
        isAvailable: editProduct.isAvailable ?? true,
        variants: editProduct.variants || [],
        brand: editProduct.brand?.trim() || '',
        size: editProduct.size?.trim() || '',
        color: editProduct.color?.trim() || '',
        unit: editProduct.unit || '',
        sku,
        updatedAt: new Date().toISOString(),
      };
      if (editId) {
        await updateDoc(tenantDoc('products', editId), data);
        toast.success('Product updated');
      } else {
        await addDoc(tenantCol('products'), { ...data, createdAt: new Date().toISOString() });
        toast.success('Product added');
      }
      setModalOpen(false);
      setEditId(null);
      setEditProduct(defaultProduct);
      fetchAll();
    } catch {
      toast.error('Failed to save product');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this product?')) return;
    setBusyId(id);
    try {
      await deleteDoc(tenantDoc('products', id));
      setProducts(prev => prev.filter(p => p.id !== id));
      toast.success('Product deleted');
    } catch {
      toast.error('Failed to delete');
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggleAvail(p: Product) {
    setBusyId(p.id);
    try {
      await updateDoc(tenantDoc('products', p.id), { isAvailable: !p.isAvailable });
      setProducts(prev => prev.map(x => x.id === p.id ? { ...x, isAvailable: !x.isAvailable } : x));
    } catch {
      toast.error('Failed to update');
    } finally {
      setBusyId(null);
    }
  }

  async function handleImageUpload(file: File) {
    setImgUploading(true);
    try {
      const url = await uploadImage(file);
      setEditProduct(prev => ({ ...prev, imageUrl: url }));
      toast.success('Image uploaded');
    } catch {
      toast.error('Image upload failed');
    } finally {
      setImgUploading(false);
    }
  }

  async function addCategory() {
    if (!newCatName.trim()) return;
    try {
      const docRef = await addDoc(tenantCol('categories'), {
        name: newCatName.trim(), color: '#c46820', icon: 'coffee',
        createdAt: new Date().toISOString(),
      });
      const newCat: Category = {
        id: docRef.id, name: newCatName.trim(), color: '#c46820',
        icon: 'coffee', createdAt: new Date().toISOString(),
      };
      setCategories(prev => [...prev, newCat]);
      setNewCatName('');
      toast.success('Category added');
    } catch {
      toast.error('Failed to add category');
    }
  }

  function startEditCat(cat: Category) {
    setEditCatId(cat.id);
    setEditCatName(cat.name);
  }

  function cancelEditCat() {
    setEditCatId(null);
    setEditCatName('');
  }

  async function saveEditCat(id: string) {
    if (!editCatName.trim()) return;
    setSavingCat(true);
    try {
      await updateDoc(tenantDoc('categories', id), { name: editCatName.trim() });
      setCategories(prev => prev.map(c => c.id === id ? { ...c, name: editCatName.trim() } : c));
      // Also update categoryName on products that use this category
      const affected = products.filter(p => p.categoryId === id);
      await Promise.all(affected.map(p =>
        updateDoc(tenantDoc('products', p.id), { categoryName: editCatName.trim() })
      ));
      setProducts(prev => prev.map(p =>
        p.categoryId === id ? { ...p, categoryName: editCatName.trim() } : p
      ));
      setEditCatId(null);
      toast.success('Category updated');
    } catch {
      toast.error('Failed to update category');
    } finally {
      setSavingCat(false);
    }
  }

  async function deleteCategory(id: string) {
    const inUse = products.some(p => p.categoryId === id);
    if (inUse) {
      toast.error('Cannot delete — category is used by products'); return;
    }
    if (!confirm('Delete this category?')) return;
    setBusyId(id);
    try {
      await deleteDoc(tenantDoc('categories', id));
      setCategories(prev => prev.filter(c => c.id !== id));
      toast.success('Category deleted');
    } catch {
      toast.error('Failed to delete category');
    } finally {
      setBusyId(null);
    }
  }

  const filtered = products.filter(p => {
    const matchSearch = matchesSearch(p, search);
    const matchCat    = !filterCat || p.categoryId === filterCat;
    return matchSearch && matchCat;
  });

  // "More details" opens by itself when the product already has one of them filled in
  const hasHiddenDetail = (p: Partial<Product>) => DETAIL_FIELDS.some(f => !mainFields.includes(f) && !!p[f]?.trim());
  function openEdit(p: Product) { setEditProduct({ ...defaultProduct, ...p }); setEditId(p.id); setMoreDetails(hasHiddenDetail(p)); setModalOpen(true); }
  function openNew()             { setEditProduct(defaultProduct); setEditId(null); setMoreDetails(false); setModalOpen(true); }

  const detailInput = (f: DetailField) => (
    <div key={f} className={f === 'sku' ? 'col-span-2' : undefined}>
      <label htmlFor={`product-${f}`} className="label">{DETAIL_LABEL[f]}</label>
      {f === 'unit' ? (
        <select id="product-unit" className="input" value={editProduct.unit || ''}
          onChange={e => setEditProduct(p => ({ ...p, unit: e.target.value }))}>
          <option value="">Piece (default)</option>
          {UNITS.filter(u => u !== 'pc').map(u => <option key={u} value={u}>{UNIT_LABEL[u]}</option>)}
        </select>
      ) : (
        <div className="relative">
          {f === 'sku' && <ScanBarcode className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-bark-400" aria-hidden="true" />}
          <input id={`product-${f}`} className={cn('input', f === 'sku' && 'pl-11')} maxLength={DETAIL_MAX[f]}
            placeholder={f === 'brand' ? 'e.g. Nestlé' : f === 'size' ? sizeExample(tenant?.businessType) : f === 'color' ? 'e.g. Black' : 'Scan or type it'}
            value={editProduct[f] || ''}
            onChange={e => setEditProduct(p => ({ ...p, [f]: e.target.value }))} />
        </div>
      )}
    </div>
  );
  const otherFields = DETAIL_FIELDS.filter(f => !mainFields.includes(f));

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 animate-fade-in max-w-[1400px] mx-auto">
      <PageHeader
        eyebrow="What you sell"
        title="Products"
        subtitle={`${products.length} ${products.length === 1 ? 'product' : 'products'}`}
        actions={
          <>
            <button onClick={() => setCatModalOpen(true)} className="btn-secondary flex-1 sm:flex-none">
              <Tag className="w-4 h-4" /> Categories
            </button>
            <button
              onClick={() => canDiscounts
                ? setDiscountsOpen(true)
                : toast(`Saved discounts: ${BUSINESS_UP.charAt(0).toLowerCase()}${BUSINESS_UP.slice(1)}`, { icon: <Lock className="w-4 h-4 text-caramel-600" aria-hidden="true" /> })}
              className={cn('btn-secondary flex-1 sm:flex-none', !canDiscounts && 'opacity-70')}
              title={canDiscounts ? undefined : 'Business and Enterprise packages'}
            >
              {canDiscounts ? <BadgePercent className="w-4 h-4" /> : <Lock className="w-4 h-4" />} Discounts
            </button>
            <button onClick={openNew} className="btn-primary flex-1 sm:flex-none">
              <Plus className="w-4 h-4" /> Add Product
            </button>
          </>
        }
      />

      {/* Filters */}
      <div className="card p-3 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-bark-400" />
          <input className="input pl-11" placeholder="Search by name, brand or code..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input sm:max-w-xs" value={filterCat} onChange={e => setFilterCat(e.target.value)}>
          <option value="">All Categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* Products Grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="card p-2 animate-pulse">
              <div className="w-full h-36 bg-cream-300/60 rounded-2xl mb-3" />
              <div className="h-4 bg-cream-300/60 rounded-full w-3/4 mb-2 mx-1.5" />
              <div className="h-3 bg-cream-200 rounded-full w-1/2 mx-1.5 mb-2" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-16 text-bark-400">
          <span className="w-16 h-16 mx-auto mb-3 rounded-full bg-cream-200 flex items-center justify-center">
            <Package className="w-7 h-7 text-caramel-500/70" />
          </span>
          <p className="font-medium text-bark-600">No products found</p>
          <p className="text-sm mt-1">Try adjusting your search or add new products</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filtered.map(p => (
            <div key={p.id} className={`card p-2 group hover:shadow-lift transition-all duration-200 ${!p.isAvailable ? 'opacity-60' : ''}`}>
              <div className="relative h-36 rounded-2xl overflow-hidden bg-gradient-to-br from-cream-200 to-cream-300">
                {p.imageUrl
                  ? <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center"><Package className="w-10 h-10 text-caramel-500/60" /></div>
                }
                {/* Hover-to-reveal only where hover exists; always visible on touch screens */}
                <div className="absolute top-2 right-2 flex gap-1 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                  <button onClick={() => openEdit(p)} className="w-8 h-8 bg-cream-50/95 rounded-full flex items-center justify-center shadow-md hover:bg-white" title="Edit product">
                    <Edit2 className="w-3.5 h-3.5 text-espresso-700" />
                  </button>
                  <button onClick={() => handleDelete(p.id)} disabled={busyId === p.id} className="w-8 h-8 bg-cream-50/95 rounded-full flex items-center justify-center shadow-md hover:bg-red-50" title="Delete product">
                    {busyId === p.id ? <Loader2 className="w-3.5 h-3.5 text-red-500 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 text-red-500" />}
                  </button>
                </div>
                {!p.isAvailable && (
                  <div className="absolute inset-0 bg-espresso-950/30 flex items-center justify-center">
                    <span className="badge bg-espresso-900/80 text-cream-50 normal-case">Unavailable</span>
                  </div>
                )}
              </div>
              <div className="px-1.5 pt-2.5 pb-1">
                <p className="font-semibold text-espresso-900 text-sm truncate">{p.name}</p>
                <p className="text-[11px] text-bark-400 mb-1.5 truncate">
                  {[productDetails(p), p.categoryName || 'Uncategorized'].filter(Boolean).join(' · ')}
                </p>
                <div className="flex items-center justify-between">
                  <span className="font-display font-semibold text-lg text-espresso-800">{formatCurrency(p.price)}</span>
                  <button
                    onClick={() => handleToggleAvail(p)}
                    disabled={busyId === p.id}
                    title={p.isAvailable ? 'Available — click to hide from POS' : 'Unavailable — click to show in POS'}
                    className="flex items-center"
                  >
                    {busyId === p.id
                      ? <span className="w-7 h-7 flex items-center justify-center"><Loader2 className="w-4 h-4 text-caramel-600 animate-spin" /></span>
                      : p.isAvailable
                        ? <ToggleRight className="w-7 h-7 text-emerald-600" />
                        : <ToggleLeft  className="w-7 h-7 text-bark-400" />}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Product Modal */}
      {modalOpen && (
        <Portal>
        <div className="modal-backdrop">
          <div className="modal-panel max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="modal-header">
              <div>
                <p className="eyebrow text-2xl -mb-1">{editId ? 'Update' : 'New product'}</p>
                <h2 className="font-display text-2xl text-espresso-900">{editId ? 'Edit Product' : 'Add Product'}</h2>
              </div>
              <button onClick={() => setModalOpen(false)} className="icon-btn"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              {/* Image Upload */}
              <div>
                <label className="label">Product Image</label>
                <div
                  className="w-full h-40 bg-cream-100 border-2 border-dashed border-caramel-300 rounded-3xl flex flex-col items-center justify-center cursor-pointer hover:bg-cream-200 hover:border-caramel-400 transition-colors relative overflow-hidden"
                  onClick={() => fileRef.current?.click()}
                >
                  {editProduct.imageUrl
                    ? <img src={editProduct.imageUrl} alt="Preview" className="w-full h-full object-cover" />
                    : imgUploading
                      ? <Loader2 className="w-8 h-8 text-caramel-600 animate-spin" />
                      : <><Upload className="w-6 h-6 text-caramel-600 mb-1" /><p className="text-xs text-bark-500">Click to upload image</p></>
                  }
                </div>
                <input ref={fileRef} type="file" accept="image/*" className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    e.target.value = ''; // so picking the same file again (e.g. after a failed upload) still fires
                    if (file) handleImageUpload(file);
                  }} />
              </div>
              <div>
                <label className="label">Product Name *</label>
                <input className="input" placeholder="e.g., Bottled Water"
                  value={editProduct.name || ''}
                  onChange={e => setEditProduct(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div>
                <label className="label">Description</label>
                <textarea className="input resize-none" rows={2} placeholder="Brief description..."
                  value={editProduct.description || ''}
                  onChange={e => setEditProduct(p => ({ ...p, description: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Price (₱) *</label>
                  <input className="input" type="number" min="0" step="0.01"
                    value={editProduct.price || ''}
                    onChange={e => setEditProduct(p => ({ ...p, price: Number(e.target.value) }))} />
                </div>
                <div>
                  <label className="label">Cost (₱)</label>
                  <input className="input" type="number" min="0" step="0.01"
                    value={editProduct.cost || ''}
                    onChange={e => setEditProduct(p => ({ ...p, cost: Number(e.target.value) }))} />
                </div>
              </div>
              <div>
                <label className="label">Category</label>
                <select className="input" value={editProduct.categoryId || ''}
                  onChange={e => setEditProduct(p => ({ ...p, categoryId: e.target.value }))}>
                  <option value="">Select category...</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              {/* Brand, size, unit, code…: the ones this kind of store uses first */}
              {mainFields.length > 0 && (
                <div className="grid grid-cols-2 gap-4">{mainFields.map(detailInput)}</div>
              )}
              {otherFields.length > 0 && (
                <div>
                  <button type="button" onClick={() => setMoreDetails(v => !v)} aria-expanded={moreDetails}
                    className="flex items-center gap-1.5 text-sm font-semibold text-caramel-700 hover:text-espresso-900">
                    <ChevronDown className={cn('w-4 h-4 transition-transform', moreDetails && 'rotate-180')} aria-hidden="true" />
                    {mainFields.length ? 'More details' : 'Brand, size, barcode and more'}
                  </button>
                  {moreDetails && <div className="mt-3 grid grid-cols-2 gap-4">{otherFields.map(detailInput)}</div>}
                </div>
              )}
              <label htmlFor="available" className="flex items-center gap-3 px-4 py-3 rounded-full bg-cream-200/60 border border-cream-300 cursor-pointer">
                <input type="checkbox" id="available"
                  checked={editProduct.isAvailable ?? true}
                  onChange={e => setEditProduct(p => ({ ...p, isAvailable: e.target.checked }))}
                  className="w-4 h-4 accent-espresso-700" />
                <span className="text-sm text-espresso-800">Available for sale</span>
              </label>
            </div>
            <div className="modal-footer">
              <button onClick={() => setModalOpen(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={handleSave} disabled={saving || imgUploading} className="btn-primary flex-1">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {saving ? 'Saving...' : 'Save Product'}
              </button>
            </div>
          </div>
        </div>
        </Portal>
      )}

      {discountsOpen && <DiscountsModal onClose={() => setDiscountsOpen(false)} />}

      {/* Category Modal */}
      {catModalOpen && (
        <Portal>
        <div className="modal-backdrop">
          <div className="modal-panel max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-2xl text-espresso-900">Categories</h2>
              <button onClick={() => { setCatModalOpen(false); cancelEditCat(); }} className="icon-btn">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Category list */}
            <div className="space-y-2 mb-4 max-h-56 overflow-y-auto">
              {categories.length === 0 && (
                <p className="text-sm text-bark-400 text-center py-4">No categories yet</p>
              )}
              {categories.map(c => (
                <div key={c.id} className="flex items-center gap-2 px-3 py-2 bg-cream-100 border border-cream-300/60 rounded-full group">
                  {editCatId === c.id ? (
                    /* ── Inline edit row ── */
                    <>
                      <input
                        autoFocus
                        className="input flex-1 py-1 text-sm"
                        value={editCatName}
                        onChange={e => setEditCatName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') saveEditCat(c.id);
                          if (e.key === 'Escape') cancelEditCat();
                        }}
                      />
                      <button
                        onClick={() => saveEditCat(c.id)}
                        disabled={savingCat}
                        className="text-xs px-3 py-1.5 bg-espresso-800 text-cream-50 rounded-full hover:bg-espresso-700 disabled:opacity-50"
                      >
                        {savingCat ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
                      </button>
                      <button onClick={cancelEditCat} className="text-bark-400 hover:text-bark-700">
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    /* ── Normal row ── */
                    <>
                      <div className="w-2.5 h-2.5 rounded-full bg-caramel-500 shrink-0 ml-1" />
                      <span className="text-sm text-espresso-800 flex-1 truncate">{c.name}</span>
                      <div className="flex gap-1 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                        <button
                          onClick={() => startEditCat(c)}
                          className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-cream-300"
                          title="Edit category"
                        >
                          <Pencil className="w-3.5 h-3.5 text-espresso-600" />
                        </button>
                        <button
                          onClick={() => deleteCategory(c.id)}
                          disabled={busyId === c.id}
                          className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-red-50"
                          title="Delete category"
                        >
                          {busyId === c.id ? <Loader2 className="w-3.5 h-3.5 text-red-500 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 text-red-500" />}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>

            {/* Add new category */}
            <div className="flex gap-2 pt-4 border-t border-cream-300/70">
              <input
                className="input flex-1"
                placeholder="New category name..."
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCategory()}
              />
              <button onClick={addCategory} className="btn-primary !px-3.5" title="Add category">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
        </Portal>
      )}
    </div>
  );
}
