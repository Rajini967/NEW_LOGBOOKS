import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { ArrowLeft, Loader2, Plus, Pencil, Trash2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { chemicalStockAPI, equipmentCategoryAPI } from "@/lib/api";
import { toast } from "@/lib/toast";
import { useAuth } from "@/contexts/AuthContext";

interface ChemicalStockRow {
  id: string;
  chemical_name: string;
  chemical_formula: string;
  location: string;
  available_qty_kg: number;
  unit: string;
  price_per_unit: number | null;
  site: string | null;
}

/** Map equipment category name to API location filter (same as backend). */
function locationFromCategoryName(name: string): "water_system" | "cooling_towers" | "boiler" {
  const v = (name || "").trim().toLowerCase();
  if (v === "boiler" || v === "boilers") return "boiler";
  if (v === "cooling_towers" || v === "cooling towers" || v === "cooling") return "cooling_towers";
  if (v === "water_system" || v === "water system" || v === "water") return "water_system";
  return "water_system";
}

const ChemicalStockPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  const [rows, setRows] = useState<ChemicalStockRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState<{ id: string; name: string }[]>([]);
  const [createForm, setCreateForm] = useState({
    categoryId: "",
    chemicalName: "",
    chemicalFormula: "",
    stock: "",
    price: "",
    site: "",
  });

  const [editOpen, setEditOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<ChemicalStockRow | null>(null);
  const [editForm, setEditForm] = useState({ stock: "", price: "", site: "" });
  const [editSubmitting, setEditSubmitting] = useState(false);

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const load = async (location?: "water_system" | "cooling_towers" | "boiler") => {
    setIsLoading(true);
    try {
      const params = location ? { location } : undefined;
      const data = await chemicalStockAPI.list(params);
      setRows(data as any);
    } catch (error: any) {
      console.error("Failed to load chemical stock:", error);
      toast.error(error?.message || "Failed to load chemical stock");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (categoryFilter === "all" || !categoryFilter) {
      void load();
    } else {
      const cat = categoryOptions.find((c) => c.id === categoryFilter);
      const location = cat ? locationFromCategoryName(cat.name) : undefined;
      void load(location);
    }
  }, [categoryFilter]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = (await equipmentCategoryAPI.list()) as { id: string; name: string }[];
        if (!cancelled) {
          setCategoryOptions(
            list.filter(
              (c) => !/chiller/i.test(c.name || "")
            )
          );
        }
      } catch {
        if (!cancelled) setCategoryOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const categoryId = createForm.categoryId.trim();
    const chemicalName = createForm.chemicalName.trim();
    const chemicalFormula = createForm.chemicalFormula.trim();
    if (!categoryId) {
      toast.error("Category is required.");
      return;
    }
    if (!chemicalName) {
      toast.error("Chemical name is required.");
      return;
    }
    const stock = createForm.stock.trim() ? parseFloat(createForm.stock) : 0;
    if (Number.isNaN(stock) || stock < 0) {
      toast.error("Stock must be a number >= 0.");
      return;
    }
    const price = createForm.price.trim() ? parseFloat(createForm.price) : undefined;
    if (price !== undefined && (Number.isNaN(price) || price < 0)) {
      toast.error("Price must be a number >= 0.");
      return;
    }
    setCreateSubmitting(true);
    try {
      await chemicalStockAPI.createEntry({
        category_id: categoryId,
        chemical_name: chemicalName,
        chemical_formula: chemicalFormula || undefined,
        stock,
        price: price ?? null,
        site: createForm.site.trim() || null,
      });
      toast.success("New stock entry created.");
      setCreateForm({
        categoryId: "",
        chemicalName: "",
        chemicalFormula: "",
        stock: "",
        price: "",
        site: "",
      });
      setCreateOpen(false);
      if (categoryFilter === "all" || !categoryFilter) void load();
      else {
        const cat = categoryOptions.find((c) => c.id === categoryFilter);
        void load(cat ? locationFromCategoryName(cat.name) : undefined);
      }
    } catch (error: any) {
      console.error("Failed to create stock entry:", error);
      toast.error(error?.message || "Failed to create stock entry");
    } finally {
      setCreateSubmitting(false);
    }
  };

  const openEdit = (row: ChemicalStockRow) => {
    setEditingRow(row);
    setEditForm({
      stock: String(row.available_qty_kg),
      price: row.price_per_unit != null ? String(row.price_per_unit) : "",
      site: row.site ?? "",
    });
    setEditOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRow) return;
    const stock = editForm.stock.trim() ? parseFloat(editForm.stock) : 0;
    if (Number.isNaN(stock) || stock < 0) {
      toast.error("Stock must be a number >= 0.");
      return;
    }
    const price = editForm.price.trim() ? parseFloat(editForm.price) : null;
    if (price !== null && (Number.isNaN(price) || price < 0)) {
      toast.error("Price must be a number >= 0.");
      return;
    }
    setEditSubmitting(true);
    try {
      await chemicalStockAPI.update(editingRow.id, {
        available_qty_kg: stock,
        price_per_unit: price,
        site: editForm.site.trim() || null,
      });
      toast.success("Stock entry updated.");
      setEditOpen(false);
      setEditingRow(null);
      if (categoryFilter === "all" || !categoryFilter) void load();
      else {
        const cat = categoryOptions.find((c) => c.id === categoryFilter);
        void load(cat ? locationFromCategoryName(cat.name) : undefined);
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to update stock entry");
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmId) return;
    setDeleteSubmitting(true);
    try {
      await chemicalStockAPI.delete(deleteConfirmId);
      toast.success("Stock entry deleted.");
      setDeleteConfirmId(null);
      if (categoryFilter === "all" || !categoryFilter) void load();
      else {
        const cat = categoryOptions.find((c) => c.id === categoryFilter);
        void load(cat ? locationFromCategoryName(cat.name) : undefined);
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to delete stock entry");
    } finally {
      setDeleteSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Header
        title="Chemical Stock Details"
        subtitle="View current chemical stock and price information"
      />

      <div className="px-6 pt-2 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => navigate("/e-log-book/chemical")}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </button>

        <div className="flex items-center gap-3">
          {isAdmin && (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Create new entry
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md max-h-[70vh] flex flex-col">
                <DialogHeader className="shrink-0">
                  <DialogTitle>Create new stock entry</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreateSubmit} className="space-y-3 mt-2 overflow-y-auto flex-1 min-h-0">
                  <div className="space-y-2">
                    <Label htmlFor="new-category">Category</Label>
                    <Select
                      value={createForm.categoryId}
                      onValueChange={(v) =>
                        setCreateForm((prev) => ({ ...prev, categoryId: v }))
                      }
                      required
                    >
                      <SelectTrigger id="new-category">
                        <SelectValue placeholder="Select equipment category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categoryOptions.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-chemical-name">Chemical Name</Label>
                    <Input
                      id="new-chemical-name"
                      value={createForm.chemicalName}
                      onChange={(e) =>
                        setCreateForm((prev) => ({ ...prev, chemicalName: e.target.value }))
                      }
                      placeholder="Enter chemical name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-chemical-formula">Chemical Formula (optional)</Label>
                    <Input
                      id="new-chemical-formula"
                      value={createForm.chemicalFormula}
                      onChange={(e) =>
                        setCreateForm((prev) => ({ ...prev, chemicalFormula: e.target.value }))
                      }
                      placeholder="e.g. NaOH, NaCl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-stock">Stock (kg)</Label>
                    <Input
                      id="new-stock"
                      type="number"
                      min={0}
                      step="any"
                      value={createForm.stock}
                      onChange={(e) =>
                        setCreateForm((prev) => ({ ...prev, stock: e.target.value }))
                      }
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-price">Price (per kg)</Label>
                    <Input
                      id="new-price"
                      type="number"
                      min={0}
                      step="any"
                      value={createForm.price}
                      onChange={(e) =>
                        setCreateForm((prev) => ({ ...prev, price: e.target.value }))
                      }
                      placeholder="Optional"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-site">Site</Label>
                    <Input
                      id="new-site"
                      value={createForm.site}
                      onChange={(e) =>
                        setCreateForm((prev) => ({ ...prev, site: e.target.value }))
                      }
                      placeholder="Optional"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setCreateOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createSubmitting}>
                      {createSubmitting ? "Saving..." : "Save entry"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          )}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Category</span>
            <Select
              value={categoryFilter}
              onValueChange={setCategoryFilter}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categoryOptions.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <main className="p-6">
        <div className="max-w-5xl mx-auto space-y-4">
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="min-w-full overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Category
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Chemical
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Stock
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Price
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Site
                    </th>
                    {isAdmin && (
                      <th className="px-4 py-2 text-right font-medium text-muted-foreground w-24">
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td
                        colSpan={isAdmin ? 6 : 5}
                        className="px-4 py-6 text-center text-muted-foreground"
                      >
                        <div className="flex items-center justify-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Loading stock...</span>
                        </div>
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={isAdmin ? 6 : 5}
                        className="px-4 py-6 text-center text-muted-foreground"
                      >
                        No stock records found.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr
                        key={row.id}
                        className="border-t border-border hover:bg-muted/40"
                      >
                        <td className="px-4 py-2">{row.location}</td>
                        <td className="px-4 py-2">
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {row.chemical_formula}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {row.chemical_name}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          {row.available_qty_kg} {row.unit || "kg"}
                        </td>
                        <td className="px-4 py-2">
                          {row.price_per_unit != null
                            ? `${row.price_per_unit} per ${row.unit || "kg"}`
                            : "—"}
                        </td>
                        <td className="px-4 py-2">
                          {row.site || "—"}
                        </td>
                        {isAdmin && (
                          <td className="px-4 py-2 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => openEdit(row)}
                                title="Edit"
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              {user?.role === "super_admin" && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => setDeleteConfirmId(row.id)}
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={(open) => { if (!open) { setEditOpen(false); setEditingRow(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit stock entry</DialogTitle>
          </DialogHeader>
          {editingRow && (
            <form onSubmit={handleEditSubmit} className="space-y-3 mt-2">
              <div className="space-y-2">
                <Label>Location</Label>
                <Input value={editingRow.location} disabled className="bg-muted" />
              </div>
              <div className="space-y-2">
                <Label>Chemical</Label>
                <Input
                  value={`${editingRow.chemical_formula} – ${editingRow.chemical_name}`}
                  disabled
                  className="bg-muted"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-stock">Stock (kg)</Label>
                <Input
                  id="edit-stock"
                  type="number"
                  min={0}
                  step="any"
                  value={editForm.stock}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, stock: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-price">Price (per kg)</Label>
                <Input
                  id="edit-price"
                  type="number"
                  min={0}
                  step="any"
                  value={editForm.price}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, price: e.target.value }))
                  }
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-site">Site</Label>
                <Input
                  id="edit-site"
                  value={editForm.site}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, site: e.target.value }))
                  }
                  placeholder="Optional"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setEditOpen(false); setEditingRow(null); }}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={editSubmitting}>
                  {editSubmitting ? "Saving..." : "Save"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation popup */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete stock entry</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this stock entry? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteConfirmId(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDeleteConfirm();
              }}
              disabled={deleteSubmitting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteSubmitting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ChemicalStockPage;
