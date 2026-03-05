import { useState, useEffect, useRef } from 'react';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { uploadImage } from '@/lib/cloudinary';
import { formatCurrency } from '@/lib/utils';
import type { Product, Category } from '@/types';
import {
  Plus, Search, Edit2, Trash2, X, Upload, Coffee,
  ToggleLeft, ToggleRight, Loader2, Tag, Pencil
} from 'lucide-react';
import toast from 'react-hot-toast';

const defaultProduct: Omit<Product, 'id' | 'createdAt' | 'updatedAt'> = {
  name: '', description: '', price: 0, categoryId: '', categoryName: '',
  imageUrl: '', isAvailable: true, cost: 0, variants: [],
};

export default function AdminProducts() {
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
  const [newCatName, setNewCatName]   = useState('');
  // Category edit/delete state
  const [editCatId, setEditCatId]     = useState<string | null>(null);
  const [editCatName, setEditCatName] = useState('');
  const [savingCat, setSavingCat]     = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    try {
      const [prodSnap, catSnap] = await Promise.all([
        getDocs(collection(db, 'products')),
        getDocs(collection(db, 'categories')),
      ]);
      setProducts(prodSnap.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
      setCategories(catSnap.docs.map(d => ({ id: d.id, ...d.data() } as Category)));
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!editProduct.name || !editProduct.price) {
      toast.error('Name and price are required'); return;
    }
    setSaving(true);
    try {
      const cat = categories.find(c => c.id === editProduct.categoryId);
      const data = {
        name: editProduct.name || '',
        description: editProduct.description || '',
        price: Number(editProduct.price),
        cost: Number(editProduct.cost || 0),
        categoryId: editProduct.categoryId || '',
        categoryName: cat?.name || '',
        imageUrl: editProduct.imageUrl || '',
        isAvailable: editProduct.isAvailable ?? true,
        variants: editProduct.variants || [],
        updatedAt: new Date().toISOString(),
      };
      if (editId) {
        await updateDoc(doc(db, 'products', editId), data);
        toast.success('Product updated');
      } else {
        await addDoc(collection(db, 'products'), { ...data, createdAt: new Date().toISOString() });
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
    try {
      await deleteDoc(doc(db, 'products', id));
      setProducts(prev => prev.filter(p => p.id !== id));
      toast.success('Product deleted');
    } catch {
      toast.error('Failed to delete');
    }
  }

  async function handleToggleAvail(p: Product) {
    try {
      await updateDoc(doc(db, 'products', p.id), { isAvailable: !p.isAvailable });
      setProducts(prev => prev.map(x => x.id === p.id ? { ...x, isAvailable: !x.isAvailable } : x));
    } catch {
      toast.error('Failed to update');
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
      const docRef = await addDoc(collection(db, 'categories'), {
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
      await updateDoc(doc(db, 'categories', id), { name: editCatName.trim() });
      setCategories(prev => prev.map(c => c.id === id ? { ...c, name: editCatName.trim() } : c));
      // Also update categoryName on products that use this category
      const affected = products.filter(p => p.categoryId === id);
      await Promise.all(affected.map(p =>
        updateDoc(doc(db, 'products', p.id), { categoryName: editCatName.trim() })
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
    try {
      await deleteDoc(doc(db, 'categories', id));
      setCategories(prev => prev.filter(c => c.id !== id));
      toast.success('Category deleted');
    } catch {
      toast.error('Failed to delete category');
    }
  }

  const filtered = products.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
    const matchCat    = !filterCat || p.categoryId === filterCat;
    return matchSearch && matchCat;
  });

  function openEdit(p: Product) { setEditProduct({ ...p }); setEditId(p.id); setModalOpen(true); }
  function openNew()             { setEditProduct(defaultProduct); setEditId(null); setModalOpen(true); }

  return (
    <div className="p-8 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-espresso-900">Products</h1>
          <p className="text-bark-500 text-sm mt-0.5">{products.length} items in menu</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setCatModalOpen(true)} className="btn-secondary flex items-center gap-2">
            <Tag className="w-4 h-4" /> Categories
          </button>
          <button onClick={openNew} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Product
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-bark-400" />
          <input className="input pl-9" placeholder="Search products..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input max-w-xs" value={filterCat} onChange={e => setFilterCat(e.target.value)}>
          <option value="">All Categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* Products Grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="card p-4 animate-pulse">
              <div className="w-full h-36 bg-cream-200 rounded-xl mb-3" />
              <div className="h-4 bg-cream-200 rounded w-3/4 mb-2" />
              <div className="h-3 bg-cream-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-bark-400">
          <Coffee className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No products found</p>
          <p className="text-sm mt-1">Try adjusting your search or add new products</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filtered.map(p => (
            <div key={p.id} className={`card overflow-hidden group hover:shadow-md transition-all duration-200 ${!p.isAvailable ? 'opacity-60' : ''}`}>
              <div className="relative h-36 bg-cream-100">
                {p.imageUrl
                  ? <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center"><Coffee className="w-10 h-10 text-cream-400" /></div>
                }
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEdit(p)} className="w-7 h-7 bg-white/90 rounded-lg flex items-center justify-center shadow-sm hover:bg-white">
                    <Edit2 className="w-3.5 h-3.5 text-espresso-700" />
                  </button>
                  <button onClick={() => handleDelete(p.id)} className="w-7 h-7 bg-white/90 rounded-lg flex items-center justify-center shadow-sm hover:bg-red-50">
                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                  </button>
                </div>
                {!p.isAvailable && (
                  <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                    <span className="bg-black/50 text-white text-xs px-2 py-1 rounded-lg">Unavailable</span>
                  </div>
                )}
              </div>
              <div className="p-3">
                <p className="font-medium text-espresso-800 text-sm truncate">{p.name}</p>
                <p className="text-xs text-bark-400 mb-2">{p.categoryName}</p>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-espresso-700">{formatCurrency(p.price)}</span>
                  <button onClick={() => handleToggleAvail(p)}>
                    {p.isAvailable
                      ? <ToggleRight className="w-5 h-5 text-emerald-500" />
                      : <ToggleLeft  className="w-5 h-5 text-bark-400" />}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Product Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-cream-100">
              <h2 className="font-display text-xl text-espresso-900">{editId ? 'Edit Product' : 'Add Product'}</h2>
              <button onClick={() => setModalOpen(false)} className="text-bark-400 hover:text-bark-700"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              {/* Image Upload */}
              <div>
                <label className="label">Product Image</label>
                <div
                  className="w-full h-36 bg-cream-50 border-2 border-dashed border-cream-300 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-cream-100 transition-colors relative overflow-hidden"
                  onClick={() => fileRef.current?.click()}
                >
                  {editProduct.imageUrl
                    ? <img src={editProduct.imageUrl} alt="Preview" className="w-full h-full object-cover" />
                    : imgUploading
                      ? <Loader2 className="w-8 h-8 text-bark-400 animate-spin" />
                      : <><Upload className="w-6 h-6 text-bark-400 mb-1" /><p className="text-xs text-bark-400">Click to upload image</p></>
                  }
                </div>
                <input ref={fileRef} type="file" accept="image/*" className="hidden"
                  onChange={e => e.target.files?.[0] && handleImageUpload(e.target.files[0])} />
              </div>
              <div>
                <label className="label">Product Name *</label>
                <input className="input" placeholder="e.g., Iced Caramel Latte"
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
              <div className="flex items-center gap-3">
                <input type="checkbox" id="available"
                  checked={editProduct.isAvailable ?? true}
                  onChange={e => setEditProduct(p => ({ ...p, isAvailable: e.target.checked }))}
                  className="w-4 h-4 accent-espresso-600" />
                <label htmlFor="available" className="text-sm text-espresso-700 cursor-pointer">Available for sale</label>
              </div>
            </div>
            <div className="flex gap-3 p-6 border-t border-cream-100">
              <button onClick={() => setModalOpen(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {saving ? 'Saving...' : 'Save Product'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Category Modal */}
      {catModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-xl text-espresso-900">Categories</h2>
              <button onClick={() => { setCatModalOpen(false); cancelEditCat(); }}>
                <X className="w-5 h-5 text-bark-400" />
              </button>
            </div>

            {/* Category list */}
            <div className="space-y-2 mb-4 max-h-56 overflow-y-auto">
              {categories.length === 0 && (
                <p className="text-sm text-bark-400 text-center py-4">No categories yet</p>
              )}
              {categories.map(c => (
                <div key={c.id} className="flex items-center gap-2 px-3 py-2 bg-cream-50 rounded-xl group">
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
                        className="text-xs px-2 py-1 bg-espresso-600 text-white rounded-lg hover:bg-espresso-700 disabled:opacity-50"
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
                      <div className="w-2.5 h-2.5 rounded-full bg-espresso-400 shrink-0" />
                      <span className="text-sm text-espresso-800 flex-1 truncate">{c.name}</span>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => startEditCat(c)}
                          className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-cream-200"
                          title="Edit category"
                        >
                          <Pencil className="w-3.5 h-3.5 text-espresso-600" />
                        </button>
                        <button
                          onClick={() => deleteCategory(c.id)}
                          className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-red-50"
                          title="Delete category"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-500" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>

            {/* Add new category */}
            <div className="flex gap-2 pt-3 border-t border-cream-100">
              <input
                className="input flex-1"
                placeholder="New category name..."
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCategory()}
              />
              <button onClick={addCategory} className="btn-primary px-3">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}