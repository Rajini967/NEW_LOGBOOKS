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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Plus,
  Wrench,
  Edit,
  Trash2,
  Filter as FilterIcon,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { departmentAPI, equipmentAPI, equipmentCategoryAPI } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

interface DepartmentOption {
  id: string;
  name: string;
}

interface CategoryOption {
  id: string;
  name: string;
}

type LogEntryIntervalType = "hourly" | "shift" | "daily";

interface Equipment {
  id: string;
  equipment_number: string;
  name: string;
  capacity?: string | null;
  created_by?: string | null;
  department: string;
  department_name?: string;
  category: string;
  category_name?: string;
  site_id?: string | null;
  client_id?: string;
  is_active: boolean;
  status?: "pending" | "approved" | "rejected";
  log_entry_interval?: LogEntryIntervalType | null;
  shift_duration_hours?: number | null;
  tolerance_minutes?: number | null;
}

export default function EquipmentListPage() {
  const { user } = useAuth();
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
    log_entry_interval: "" as "" | LogEntryIntervalType,
    shift_duration_hours: "" as "" | number,
    tolerance_minutes: "" as "" | number,
  });

  const [confirmAction, setConfirmAction] = useState<{
    id: string;
    action: "approve" | "reject";
  } | null>(null);

  const canApprove =
    user?.role === "super_admin" || user?.role === "manager";

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
      log_entry_interval: "",
      shift_duration_hours: "",
      tolerance_minutes: "",
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
      log_entry_interval: (item.log_entry_interval as LogEntryIntervalType) || "",
      shift_duration_hours: item.shift_duration_hours ?? "",
      tolerance_minutes: item.tolerance_minutes ?? "",
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
    if (formData.log_entry_interval === "shift") {
      const hours = formData.shift_duration_hours;
      if (hours === "" || hours == null || hours < 1 || hours > 24) {
        toast.error("Shift duration must be between 1 and 24 hours when interval is Shift.");
        return;
      }
    }

    setIsLoading(true);
    try {
      const payload: Record<string, unknown> = {
        equipment_number: formData.equipment_number.trim(),
        name: formData.name.trim(),
        capacity: formData.capacity.trim() || null,
        department: formData.department,
        category: formData.category,
        is_active: formData.is_active,
      };
      if (formData.log_entry_interval) {
        payload.log_entry_interval = formData.log_entry_interval;
        payload.shift_duration_hours =
          formData.log_entry_interval === "shift" && formData.shift_duration_hours !== ""
            ? formData.shift_duration_hours
            : null;
      } else {
        payload.log_entry_interval = null;
        payload.shift_duration_hours = null;
      }

      if (formData.tolerance_minutes === "" || formData.tolerance_minutes == null) {
        payload.tolerance_minutes = null;
      } else {
        const tol = Number(formData.tolerance_minutes);
        payload.tolerance_minutes = Number.isFinite(tol) && tol >= 0 ? tol : 0;
      }

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

  const handleApproveAction = async (
    action: "approve" | "reject",
    id: string,
  ) => {
    if (!canApprove) {
      toast.error(
        action === "approve"
          ? "Only Manager / Super Admin can approve equipment."
          : "Only Manager / Super Admin can reject equipment.",
      );
      return;
    }
    try {
      const updated = await equipmentAPI.approve(id, action);
      setEquipment((prev) =>
        prev.map((e) => (e.id === id ? updated : e)),
      );
      toast.success(
        action === "approve"
          ? "Equipment approved successfully."
          : "Equipment rejected.",
      );
    } catch (error: any) {
      const message =
        error?.message ||
        error?.data?.detail ||
        "Failed to update equipment status";
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
              <DialogContent className="flex flex-col w-[95vw] sm:max-w-xl md:max-w-2xl lg:max-w-3xl max-h-[85vh] overflow-hidden">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Wrench className="w-5 h-5" />
                    {isEditMode ? "Edit Equipment" : "Register Equipment"}
                  </DialogTitle>
                </DialogHeader>
                <form
                  onSubmit={handleSubmit}
                  className="flex flex-col gap-4 flex-1 min-h-0"
                >
                  <div className="space-y-4 overflow-y-auto pr-2 flex-1 min-h-0">
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
                      <Label>Log entry interval</Label>
                      <Select
                        value={formData.log_entry_interval || "__none__"}
                        onValueChange={(v) =>
                          setFormData((prev) => ({
                            ...prev,
                            log_entry_interval:
                              v === "__none__" ? "" : (v as LogEntryIntervalType),
                            shift_duration_hours:
                              v === "shift" ? prev.shift_duration_hours : "",
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Use global default" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Use global default</SelectItem>
                          <SelectItem value="hourly">Hourly</SelectItem>
                          <SelectItem value="shift">Shift</SelectItem>
                          <SelectItem value="daily">Daily</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Override the global log entry interval for this equipment.
                        Empty = use Settings default.
                      </p>
                      {formData.log_entry_interval === "shift" && (
                        <div className="space-y-1 pt-2">
                          <Label htmlFor="shift_duration_hours">
                            Shift duration (hours)
                          </Label>
                          <Input
                            id="shift_duration_hours"
                            type="number"
                            min={1}
                            max={24}
                            value={
                              formData.shift_duration_hours === ""
                                ? ""
                                : formData.shift_duration_hours
                            }
                            onChange={(e) => {
                              const v = e.target.value;
                              setFormData((prev) => ({
                                ...prev,
                                shift_duration_hours:
                                  v === "" ? "" : parseInt(v, 10) || 8,
                              }));
                            }}
                            placeholder="e.g. 8"
                          />
                        </div>
                      )}
                    </div>

                    <div className="space-y-2 pt-2 border-t border-border">
                      <Label htmlFor="tolerance_minutes">
                        Log entry tolerance (minutes)
                      </Label>
                      <Input
                        id="tolerance_minutes"
                        type="number"
                        min={0}
                        value={
                          formData.tolerance_minutes === ""
                            ? ""
                            : formData.tolerance_minutes
                        }
                        onChange={(e) => {
                          const v = e.target.value;
                          setFormData((prev) => ({
                            ...prev,
                            tolerance_minutes:
                              v === "" ? "" : Math.max(0, parseInt(v, 10) || 0),
                          }));
                        }}
                        placeholder="e.g. 15 (±15 minutes around scheduled time)"
                      />
                      <p className="text-xs text-muted-foreground">
                        Within this tolerance window, new log rows will be shown in
                        yellow; after the tolerance window they will be shown in
                        red. Leave blank or 0 to disable tolerance highlighting for
                        this equipment.
                      </p>
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
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t border-border">
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
                          variant={
                            item.status === "approved"
                              ? "success"
                              : item.status === "rejected"
                              ? "destructive"
                              : "pending"
                          }
                        >
                          {item.status
                            ? item.status.charAt(0).toUpperCase() +
                              item.status.slice(1)
                            : "Approved"}
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
                          {canApprove && (
                            <>
                              {(() => {
                                const isPending =
                                  !item.status || item.status === "pending";
                                const canChangeStatus = isPending;

                                const handleClick = (
                                  action: "approve" | "reject",
                                ) => {
                                  if (!canChangeStatus) return;

                                  // If current user is the creator, call API directly.
                                  if (
                                    item.created_by &&
                                    String(item.created_by) ===
                                      String(user?.id || "")
                                  ) {
                                    void handleApproveAction(action, item.id);
                                    return;
                                  }

                                  // For a different user, open confirmation popup.
                                  setConfirmAction({ id: item.id, action });
                                };

                                return (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      disabled={!canChangeStatus}
                                      className={
                                        !canChangeStatus
                                          ? "opacity-40 cursor-not-allowed"
                                          : ""
                                      }
                                      onClick={() => handleClick("approve")}
                                      title="Approve equipment"
                                    >
                                      <CheckCircle className="w-4 h-4 text-green-600" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      disabled={!canChangeStatus}
                                      className={
                                        !canChangeStatus
                                          ? "opacity-40 cursor-not-allowed"
                                          : ""
                                      }
                                      onClick={() => handleClick("reject")}
                                      title="Reject equipment"
                                    >
                                      <XCircle className="w-4 h-4 text-red-600" />
                                    </Button>
                                  </>
                                );
                              })()}
                            </>
                          )}
                          {user?.role === "super_admin" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(item.id)}
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
      {/* Approval / rejection confirmation for non-creator users */}
      <AlertDialog
        open={!!confirmAction}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.action === "reject"
                ? "Reject equipment"
                : "Approve equipment"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.action === "reject"
                ? "Are you sure you want to mark this equipment as Rejected? The record will stay in the list but with status \"Rejected\"."
                : "Are you sure you want to approve this equipment record? It will be marked as Approved in the equipment list."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setConfirmAction(null);
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className={
                confirmAction?.action === "reject"
                  ? "bg-red-600 hover:bg-red-700 text-white"
                  : "bg-green-600 hover:bg-green-700 text-white"
              }
              onClick={async () => {
                if (confirmAction) {
                  await handleApproveAction(
                    confirmAction.action,
                    confirmAction.id,
                  );
                  setConfirmAction(null);
                }
              }}
            >
              {confirmAction?.action === "reject" ? "Reject" : "Approve"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

