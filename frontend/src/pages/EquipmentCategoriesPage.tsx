import React, { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Layers, Edit, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { equipmentCategoryAPI } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

interface EquipmentCategory {
  id: string;
  name: string;
  client_id?: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export default function EquipmentCategoriesPage() {
  const { user } = useAuth();
  const [categories, setCategories] = useState<EquipmentCategory[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    is_active: true,
  });

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const data = await equipmentCategoryAPI.list();
        setCategories(data);
      } catch (error) {
        console.error("Failed to fetch equipment categories:", error);
        toast.error("Failed to load equipment categories");
      }
    };
    fetchCategories();
  }, []);

  const resetForm = () => {
    setFormData({ name: "", is_active: true });
    setIsEditMode(false);
    setEditingId(null);
  };

  const handleEdit = (category: EquipmentCategory) => {
    setEditingId(category.id);
    setIsEditMode(true);
    setFormData({
      name: category.name,
      is_active: category.is_active ?? true,
    });
    setIsDialogOpen(true);
  };

  const extractErrorMessage = (error: any, fallback: string) => {
    if (error?.data) {
      const data = error.data;
      if (typeof data === "string") return data;
      if (data.detail) return data.detail;
      if (data.error) return data.error;
      if (data.name) {
        const first = Array.isArray(data.name) ? data.name[0] : data.name;
        return String(first);
      }
      if (data.non_field_errors) {
        const first = Array.isArray(data.non_field_errors)
          ? data.non_field_errors[0]
          : data.non_field_errors;
        return String(first);
      }
      if (Object.keys(data).length > 0) {
        const firstError = Object.values(data)[0] as any;
        return Array.isArray(firstError) ? firstError[0] : String(firstError);
      }
    }
    if (error?.message) return error.message;
    return fallback;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error("Category name is required");
      return;
    }

    setIsLoading(true);
    try {
      if (isEditMode && editingId) {
        const updated = await equipmentCategoryAPI.update(editingId, {
          name: formData.name.trim(),
          is_active: formData.is_active,
        });
        setCategories((prev) =>
          prev.map((c) => (c.id === editingId ? updated : c))
        );
        toast.success("Equipment category updated successfully");
      } else {
        const created = await equipmentCategoryAPI.create({
          name: formData.name.trim(),
          is_active: formData.is_active,
        });
        setCategories((prev) => [created, ...prev]);
        toast.success("Equipment category created successfully");
      }
      setIsDialogOpen(false);
      resetForm();
    } catch (error: any) {
      console.error("Save equipment category error:", error);
      const message = extractErrorMessage(
        error,
        isEditMode
          ? "Failed to update equipment category"
          : "Failed to create equipment category"
      );
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this equipment category?"))
      return;
    try {
      await equipmentCategoryAPI.delete(id);
      setCategories((prev) => prev.filter((c) => c.id !== id));
      toast.success("Equipment category deleted successfully");
    } catch (error: any) {
      console.error("Delete equipment category error:", error);
      const message = extractErrorMessage(
        error,
        "Failed to delete equipment category"
      );
      toast.error(message);
    }
  };

  return (
    <div className="min-h-screen">
      <Header
        title="Equipment Categories"
        subtitle="Manage equipment categories for grouping equipment"
      />
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="success">{categories.length} Categories</Badge>
            <Badge variant="secondary">
              {categories.filter((c) => c.is_active).length} Active
            </Badge>
          </div>

          <Dialog
            open={isDialogOpen}
            onOpenChange={(open) => {
              setIsDialogOpen(open);
              if (!open) resetForm();
            }}
          >
            <DialogTrigger asChild>
              <Button variant="accent">
                <Plus className="w-4 h-4 mr-2" />
                Add Category
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[420px]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Layers className="w-5 h-5" />
                  {isEditMode ? "Edit Category" : "Create Category"}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">
                    Category Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, name: e.target.value }))
                    }
                    placeholder="e.g. Chillers"
                    required
                  />
                </div>
                <div className="space-y-2 pt-2 border-t border-border">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="is_active"
                      checked={formData.is_active}
                      onCheckedChange={(checked) =>
                        setFormData((prev) => ({
                          ...prev,
                          is_active: checked as boolean,
                        }))
                      }
                    />
                    <Label
                      htmlFor="is_active"
                      className="text-sm font-normal cursor-pointer"
                    >
                      Active
                    </Label>
                  </div>
                  <p className="text-xs text-muted-foreground ml-6">
                    Inactive categories will be hidden from selection in forms.
                  </p>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" variant="accent" disabled={isLoading}>
                    {isLoading
                      ? isEditMode
                        ? "Saving..."
                        : "Creating..."
                      : isEditMode
                      ? "Save Changes"
                      : "Create Category"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {categories.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-4 py-10 text-center text-muted-foreground"
                    >
                      No equipment categories found. Use &quot;Add Category&quot;
                      to create one.
                    </td>
                  </tr>
                ) : (
                  categories.map((category) => (
                    <tr
                      key={category.id}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 text-sm font-medium text-foreground">
                        {category.name}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={category.is_active ? "success" : "secondary"}
                        >
                          {category.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(category)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          {user?.role === "super_admin" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(category.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
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
    </div>
  );
}


