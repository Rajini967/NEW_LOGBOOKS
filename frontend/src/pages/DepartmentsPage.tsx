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
import { Plus, Building2, Edit, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { departmentAPI } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

interface Department {
  id: string;
  name: string;
  client_id?: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export default function DepartmentsPage() {
  const { user } = useAuth();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    is_active: true,
  });

  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        const data = await departmentAPI.list();
        setDepartments(data);
      } catch (error) {
        console.error("Failed to fetch departments:", error);
        toast.error("Failed to load departments");
      }
    };
    fetchDepartments();
  }, []);

  const resetForm = () => {
    setFormData({ name: "", is_active: true });
    setIsEditMode(false);
    setEditingId(null);
  };

  const handleEdit = (dept: Department) => {
    setEditingId(dept.id);
    setIsEditMode(true);
    setFormData({
      name: dept.name,
      is_active: dept.is_active ?? true,
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
      toast.error("Department name is required");
      return;
    }

    setIsLoading(true);
    try {
      if (isEditMode && editingId) {
        const updated = await departmentAPI.update(editingId, {
          name: formData.name.trim(),
          is_active: formData.is_active,
        });
        setDepartments((prev) =>
          prev.map((d) => (d.id === editingId ? updated : d))
        );
        toast.success("Department updated successfully");
      } else {
        const created = await departmentAPI.create({
          name: formData.name.trim(),
          is_active: formData.is_active,
        });
        setDepartments((prev) => [created, ...prev]);
        toast.success("Department created successfully");
      }
      setIsDialogOpen(false);
      resetForm();
    } catch (error: any) {
      console.error("Save department error:", error);
      const message = extractErrorMessage(
        error,
        isEditMode ? "Failed to update department" : "Failed to create department"
      );
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this department?")) return;
    try {
      await departmentAPI.delete(id);
      setDepartments((prev) => prev.filter((d) => d.id !== id));
      toast.success("Department deleted successfully");
    } catch (error: any) {
      console.error("Delete department error:", error);
      const message = extractErrorMessage(error, "Failed to delete department");
      toast.error(message);
    }
  };

  return (
    <div className="min-h-screen">
      <Header
        title="Departments"
        subtitle="Manage equipment departments used across logbooks"
      />
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="success">{departments.length} Departments</Badge>
            <Badge variant="secondary">
              {departments.filter((d) => d.is_active).length} Active
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
                Add Department
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[420px]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Building2 className="w-5 h-5" />
                  {isEditMode ? "Edit Department" : "Create Department"}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">
                    Department Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, name: e.target.value }))
                    }
                    placeholder="e.g. Engineering"
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
                    Inactive departments will be hidden from selection in forms.
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
                      : "Create Department"}
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
                {departments.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-4 py-10 text-center text-muted-foreground"
                    >
                      No departments found. Use &quot;Add Department&quot; to
                      create one.
                    </td>
                  </tr>
                ) : (
                  departments.map((dept) => (
                    <tr
                      key={dept.id}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 text-sm font-medium text-foreground">
                        {dept.name}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={dept.is_active ? "success" : "secondary"}
                        >
                          {dept.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(dept)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          {user?.role === "super_admin" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(dept.id)}
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


