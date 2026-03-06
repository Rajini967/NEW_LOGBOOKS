import React, { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { filterCategoryAPI } from "@/lib/api";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Plus, Pencil, Trash2, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface FilterCategory {
  id: string;
  name: string;
  description?: string | null;
  micron_costs?: Record<string, number> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const MICRON_OPTIONS = ["0.2", "0.45", "1", "3", "5", "10", "20", "100"] as const;

const FilterCategoriesPage: React.FC = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [categories, setCategories] = useState<FilterCategory[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<FilterCategory | null>(
    null
  );
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [micronCosts, setMicronCosts] = useState<Record<string, string>>({});
  const [isActive, setIsActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = () => {
    setEditingCategory(null);
    setName("");
    setDescription("");
    setMicronCosts({});
    setIsActive(true);
  };

  const openCreateDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (category: FilterCategory) => {
    setEditingCategory(category);
    setName(category.name);
    setDescription(category.description || "");
    const existing = category.micron_costs || {};
    const next: Record<string, string> = {};
    MICRON_OPTIONS.forEach((m) => {
      const v = (existing as any)[m];
      next[m] = v == null ? "" : String(v);
    });
    setMicronCosts(next);
    setIsActive(category.is_active);
    setIsDialogOpen(true);
  };

  const loadCategories = async () => {
    setIsLoading(true);
    try {
      const data = await filterCategoryAPI.list();
      setCategories(data);
    } catch (error: any) {
      toast({
        title: "Failed to load categories",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadCategories();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast({
        title: "Name is required",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const micron_costs: Record<string, number> = {};
      Object.entries(micronCosts).forEach(([k, v]) => {
        const trimmed = String(v ?? "").trim();
        if (!trimmed) return;
        const num = Number(trimmed);
        if (!Number.isFinite(num)) return;
        micron_costs[k] = num;
      });

      if (editingCategory) {
        await filterCategoryAPI.update(editingCategory.id, {
          name: name.trim(),
          description: description.trim() || null,
          micron_costs,
          is_active: isActive,
        });
        toast({
          title: "Category updated",
        });
      } else {
        await filterCategoryAPI.create({
          name: name.trim(),
          description: description.trim() || undefined,
          micron_costs,
          is_active: isActive,
        });
        toast({
          title: "Category created",
        });
      }

      setIsDialogOpen(false);
      resetForm();
      await loadCategories();
    } catch (error: any) {
      const detail =
        error?.data?.name?.[0] ||
        error?.data?.detail ||
        error?.message ||
        "Please check the form and try again.";
      toast({
        title: "Save failed",
        description: detail,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (category: FilterCategory) => {
    if (!window.confirm(`Delete filter category "${category.name}"?`)) {
      return;
    }
    try {
      await filterCategoryAPI.delete(category.id);
      toast({
        title: "Category deleted",
      });
      await loadCategories();
    } catch (error: any) {
      toast({
        title: "Delete failed",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen">
      <Header
        title="Filter Categories"
        subtitle="Create and manage filter categories such as HVAC, Water System, Compressed Air, Nitrogen Air and Utilities."
      />

      <div className="px-6 pt-2">
        <button
          type="button"
          onClick={() => navigate("/e-log-book/filter/settings")}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </button>
      </div>

      <main className="p-6">
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">
              Categories
            </h2>
            <Button onClick={openCreateDialog}>
              <Plus className="w-4 h-4 mr-2" />
              Add Category
            </Button>
          </div>

          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="min-w-full overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Name
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Description
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Active
                    </th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-6 text-center text-muted-foreground"
                      >
                        <div className="flex items-center justify-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Loading categories...</span>
                        </div>
                      </td>
                    </tr>
                  ) : categories.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-6 text-center text-muted-foreground"
                      >
                        No categories found. Click &quot;Add Category&quot; to
                        create one.
                      </td>
                    </tr>
                  ) : (
                    categories.map((category) => (
                      <tr
                        key={category.id}
                        className="border-t border-border hover:bg-muted/40"
                      >
                        <td className="px-4 py-2">{category.name}</td>
                        <td className="px-4 py-2 text-muted-foreground">
                          {category.description || "—"}
                        </td>
                        <td className="px-4 py-2">
                          <span
                            className={
                              category.is_active
                                ? "inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                                : "inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-900/50 dark:text-slate-300"
                            }
                          >
                            {category.is_active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <div className="inline-flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openEditDialog(category)}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              onClick={() => handleDelete(category)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) {
            resetForm();
          }
        }}
      >
        <DialogContent>
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>
                {editingCategory ? "Edit Category" : "Add Category"}
              </DialogTitle>
              <DialogDescription>
                {editingCategory
                  ? "Update the filter category details."
                  : "Create a new filter category."}
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">
                  Name<span className="text-destructive">*</span>
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. HVAC"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">
                  Description
                </label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional description"
                />
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium text-foreground">
                  Cost per micron size (optional)
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {MICRON_OPTIONS.map((m) => (
                    <div key={m} className="space-y-1">
                      <label className="text-xs text-muted-foreground">{m} µ</label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={micronCosts[m] ?? ""}
                        onChange={(e) =>
                          setMicronCosts((prev) => ({ ...prev, [m]: e.target.value }))
                        }
                        placeholder="Cost"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="text-sm font-medium text-foreground">
                    Active
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Inactive categories will not be used for new registrations.
                  </div>
                </div>
                <Switch
                  checked={isActive}
                  onCheckedChange={(checked) => setIsActive(checked)}
                />
              </div>
            </div>

            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                {editingCategory ? "Save changes" : "Create category"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FilterCategoriesPage;

