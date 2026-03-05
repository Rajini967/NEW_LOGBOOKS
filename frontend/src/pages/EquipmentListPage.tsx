import React, { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Wrench, Edit, Trash2, Filter as FilterIcon } from "lucide-react";
import { toast } from "sonner";
import { departmentAPI, equipmentAPI, equipmentCategoryAPI } from "@/lib/api";

interface DepartmentOption {
  id: string;
  name: string;
}

interface CategoryOption {
  id: string;
  name: string;
}

interface Equipment {
  id: string;
  equipment_number: string;
  name: string;
  capacity?: string | null;
  department: string;
  department_name?: string;
  category: string;
  category_name?: string;
  site_id?: string | null;
  client_id?: string;
  is_active: boolean;
}

export default function EquipmentListPage() {
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [filters, setFilters] = useState<{
    department?: string;
    category?: string;
  }>({});
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    equipment_number: "",
    name: "",
    capacity: "",
    department: "",
    category: "",
    is_active: true,
  });

  useEffect(() => {
    const loadLookups = async () => {
      try {
        const [deptData, catData] = await Promise.all([
          departmentAPI.list(),
          equipmentCategoryAPI.list(),
        ]);
        setDepartments(deptData);
        setCategories(catData);
      } catch (error) {
        console.error("Failed to load equipment lookups:", error);
        toast.error("Failed to load departments and categories");
      }
    };
    loadLookups();
  }, []);

  const loadEquipment = async (activeFilters = filters) => {
    try {
      const data = await equipmentAPI.list(activeFilters);
      setEquipment(data);
    } catch (error) {
      console.error("Failed to fetch equipment:", error);
      toast.error("Failed to load equipment list");
    }
  };

  useEffect(() => {
    loadEquipment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetForm = () => {
    setFormData({
      equipment_number: "",
      name: "",
      capacity: "",
      department: "",
      category: "",
      is_active: true,
    });
    setIsEditMode(false);
    setEditingId(null);
  };

  const handleFilterChange = (key: "department" | "category", value?: string) => {
    const nextFilters = {
      ...filters,
      [key]: value || undefined,
    };
    if (!nextFilters.department) delete nextFilters.department;
    if (!nextFilters.category) delete nextFilters.category;
    setFilters(nextFilters);
    loadEquipment(nextFilters);
  };

  const handleEdit = (item: Equipment) => {
    setEditingId(item.id);
    setIsEditMode(true);
    setFormData({
      equipment_number: item.equipment_number,
      name: item.name,
      capacity: item.capacity || "",
      department: item.department,
      category: item.category,
      is_active: item.is_active ?? true,
    });
    setIsDialogOpen(true);
  };

  const extractErrorMessage = (error: any, fallback: string) => {
    const data = error?.data || error?.response?.data;
    if (data) {
      if (typeof data === "string") return data;
      if (data.detail) return data.detail;
      if (data.error) return data.error;
      if (data.equipment_number) {
        const first = Array.isArray(data.equipment_number)
          ? data.equipment_number[0]
          : data.equipment_number;
        return String(first);
      }
      if (data.department) {
        const first = Array.isArray(data.department)
          ? data.department[0]
          : data.department;
        return String(first);
      }
      if (data.category) {
        const first = Array.isArray(data.category)
          ? data.category[0]
          : data.category;
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
    if (!formData.equipment_number.trim()) {
      toast.error("Equipment Number is required");
      return;
    }
    if (!formData.name.trim()) {
      toast.error("Equipment Name is required");
      return;
    }
    if (!formData.department) {
      toast.error("Department is required");
      return;
    }
    if (!formData.category) {
      toast.error("Equipment Category is required");
      return;
    }

    setIsLoading(true);
    try {
      const payload = {
        equipment_number: formData.equipment_number.trim(),
        name: formData.name.trim(),
        capacity: formData.capacity.trim() || null,
        department: formData.department,
        category: formData.category,
        is_active: formData.is_active,
      };

      if (isEditMode && editingId) {
        const updated = await equipmentAPI.update(editingId, payload as any);
        setEquipment((prev) =>
          prev.map((e) => (e.id === editingId ? updated : e))
        );
        toast.success("Equipment updated successfully");
      } else {
        const created = await equipmentAPI.create(payload as any);
        setEquipment((prev) => [created, ...prev]);
        toast.success("Equipment created successfully");
      }
      setIsDialogOpen(false);
      resetForm();
    } catch (error: any) {
      console.error("Save equipment error:", error);
      const message = extractErrorMessage(
        error,
        isEditMode ? "Failed to update equipment" : "Failed to create equipment"
      );
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this equipment?")) return;
    try {
      await equipmentAPI.delete(id);
      setEquipment((prev) => prev.filter((e) => e.id !== id));
      toast.success("Equipment deleted successfully");
    } catch (error: any) {
      console.error("Delete equipment error:", error);
      const message = extractErrorMessage(error, "Failed to delete equipment");
      toast.error(message);
    }
  };

  const findDepartmentName = (id: string) =>
    departments.find((d) => d.id === id)?.name;
  const findCategoryName = (id: string) =>
    categories.find((c) => c.id === id)?.name;

  return (
    <div className="min-h-screen">
      <Header
        title="Equipment List"
        subtitle="Manage master equipment and assignments"
      />
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="success">{equipment.length} Equipment</Badge>
            <Badge variant="secondary">
              {equipment.filter((e) => e.is_active).length} Active
            </Badge>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <FilterIcon className="w-4 h-4 text-muted-foreground" />
              <Select
                value={filters.department || "all"}
                onValueChange={(value) =>
                  handleFilterChange(
                    "department",
                    value === "all" ? undefined : value
                  )
                }
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by Department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={filters.category || "all"}
                onValueChange={(value) =>
                  handleFilterChange(
                    "category",
                    value === "all" ? undefined : value
                  )
                }
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Filter by Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                  Add Equipment
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[520px]">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Wrench className="w-5 h-5" />
                    {isEditMode ? "Edit Equipment" : "Register Equipment"}
                  </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="equipment_number">
                        Equipment Number{" "}
                        <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="equipment_number"
                        value={formData.equipment_number}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            equipment_number: e.target.value,
                          }))
                        }
                        placeholder="e.g. CH-001"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="name">
                        Equipment Name{" "}
                        <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            name: e.target.value,
                          }))
                        }
                        placeholder="e.g. Chiller 1"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="department">
                        Department <span className="text-destructive">*</span>
                      </Label>
                      <Select
                        value={formData.department}
                        onValueChange={(value) =>
                          setFormData((prev) => ({
                            ...prev,
                            department: value,
                          }))
                        }
                      >
                        <SelectTrigger id="department">
                          <SelectValue placeholder="Select department" />
                        </SelectTrigger>
                        <SelectContent>
                          {departments.map((dept) => (
                            <SelectItem key={dept.id} value={dept.id}>
                              {dept.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="category">
                        Category <span className="text-destructive">*</span>
                      </Label>
                      <Select
                        value={formData.category}
                        onValueChange={(value) =>
                          setFormData((prev) => ({
                            ...prev,
                            category: value,
                          }))
                        }
                      >
                        <SelectTrigger id="category">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map((cat) => (
                            <SelectItem key={cat.id} value={cat.id}>
                              {cat.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="capacity">
                      Capacity
                      <span className="text-xs text-muted-foreground ml-1">
                        (numeric value with optional unit, e.g. 1000 TR)
                      </span>
                    </Label>
                    <Input
                      id="capacity"
                      value={formData.capacity}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          capacity: e.target.value,
                        }))
                      }
                      placeholder='e.g. "1000 TR" or "5 TPH"'
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
                      Inactive equipment will be hidden from selection in new
                      entries.
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
                        : "Create Equipment"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Equipment
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Department
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Capacity
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
                {equipment.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-10 text-center text-muted-foreground"
                    >
                      No equipment found. Use &quot;Add Equipment&quot; to
                      register a new item.
                    </td>
                  </tr>
                ) : (
                  equipment.map((item) => (
                    <tr
                      key={item.id}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {item.name}
                          </p>
                          <p className="text-xs text-muted-foreground font-mono">
                            {item.equipment_number}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {item.department_name || findDepartmentName(item.department) || "—"}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {item.category_name || findCategoryName(item.category) || "—"}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {item.capacity || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={item.is_active ? "success" : "secondary"}
                        >
                          {item.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(item)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(item.id)}
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
    </div>
  );
}


