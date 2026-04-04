import React, { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  DialogDescription,
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
import { toast } from "@/lib/toast";
import { departmentAPI, equipmentAPI, equipmentCategoryAPI } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { normalizeUserRole } from "@/lib/auth/role";

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
  created_by?: string | null | { id: string };
  approval_comment?: string | null;
  rejection_comment?: string | null;
  created_by_name?: string | null;
  approved_by_name?: string | null;
  approved_by_id?: string | null;
  secondary_approved_by_id?: string | null;
  secondary_approved_by_name?: string | null;
  corrects_id?: string | null;
  has_corrections?: boolean;
  department: string;
  department_name?: string;
  category: string;
  category_name?: string;
  site_id?: string | null;
  client_id?: string;
  is_active: boolean;
  status?: "draft" | "pending" | "approved" | "rejected" | "pending_secondary_approval";
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

  /** Step 1: confirm approve/reject (same flow as E Log Book / Boiler) */
  const [confirmAction, setConfirmAction] = useState<{
    id: string;
    action: "approve" | "reject";
  } | null>(null);
  /** Step 2: required comment */
  const [actionCommentDialog, setActionCommentDialog] = useState<{
    id: string;
    action: "approve" | "reject";
  } | null>(null);
  const [actionCommentText, setActionCommentText] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const role = user ? normalizeUserRole(user.role) : undefined;
  const canManageEquipment =
    role === "supervisor" ||
    role === "manager" ||
    role === "admin" ||
    role === "super_admin";
  /** Approve / reject — Manager, Admin, Super Admin only (not Supervisor). */
  const canApproveEquipment =
    role === "manager" || role === "admin" || role === "super_admin";
  const canDeleteEquipment = role === "admin" || role === "super_admin";

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
    const status = String(item.status || "").toLowerCase();
    const isCorrectionEntry = Boolean(item.corrects_id);
    const isRejectedSourceWithCorrections =
      status === "rejected" && !isCorrectionEntry && Boolean(item.has_corrections);
    const canEditRejectedRow =
      status === "rejected" && (isCorrectionEntry || !isRejectedSourceWithCorrections);
    if (!canEditRejectedRow) {
      toast.error(
        "Only rejected equipment entries can be edited for correction."
      );
      return;
    }
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
      if (typeof data === "string") {
        const t = data.trim();
        if (
          t.startsWith("<!") ||
          t.includes("<html") ||
          t.includes("DEBUG = True")
        ) {
          return fallback;
        }
        return data;
      }
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
        // Correction flow: editing a rejected source creates a new pending correction row.
        const source = equipment.find((e) => e.id === editingId);
        const sourceStatus = String(source?.status || "").toLowerCase();
        const isCorrectionEntry = Boolean(source?.corrects_id);
        const isRejectedSourceWithCorrections =
          sourceStatus === "rejected" &&
          !isCorrectionEntry &&
          Boolean(source?.has_corrections);
        const canCorrectFromSource =
          sourceStatus === "rejected" &&
          (isCorrectionEntry || !isRejectedSourceWithCorrections);
        if (!canCorrectFromSource) {
          toast.error("Only rejected equipment entries can be corrected.");
          return;
        }

        const corrected = await equipmentAPI.correct(editingId, payload as any);
        setEquipment((prev) => [corrected, ...prev]);
        toast.success("Correction entry created with Pending secondary approval status.");
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

  const executeDelete = async (id: string) => {
    try {
      await equipmentAPI.delete(id);
      setEquipment((prev) => prev.filter((e) => e.id !== id));
      toast.success("Equipment deleted successfully");
    } catch (error: any) {
      console.error("Delete equipment error:", error);
      const message = extractErrorMessage(error, "Failed to delete equipment");
      const relatedRecords = error?.data?.related_records || error?.response?.data?.related_records;
      const lowerMessage = String(message).toLowerCase();
      if (
        (Array.isArray(relatedRecords) && relatedRecords.length > 0) ||
        lowerMessage.includes("assigned to one or more filters") ||
        lowerMessage.includes("referenced by other records") ||
        lowerMessage.includes("remove the filter assignments first") ||
        lowerMessage.includes("foreign-key related records exist")
      ) {
        const details =
          Array.isArray(relatedRecords) && relatedRecords.length > 0
            ? relatedRecords.map((r: any) => `${r.relation} (${r.count})`).join(", ")
            : "Unknown";
        toast.error(
          `Cannot delete equipment now.\n1) Delete related records first.\n2) Related: ${details}\n3) Then delete this equipment from Equipment List.`
        );
        return;
      }
      toast.error(message);
    }
  };

  const handleApproveAction = async (
    action: "approve" | "reject",
    id: string,
    remarks: string,
  ) => {
    if (!canApproveEquipment) {
      toast.error(
        action === "approve"
          ? "Only Manager, Admin, or Super Admin can approve equipment."
          : "Only Manager, Admin, or Super Admin can reject equipment.",
      );
      return;
    }
    try {
      const updated = await equipmentAPI.approve(id, action, remarks);
      setEquipment((prev) =>
        prev.map((e) => (e.id === id ? updated : e)),
      );
      toast.success(
        action === "approve"
          ? "Equipment approved successfully."
          : "Equipment rejected.",
      );
    } catch (error: any) {
      const data = error?.data || error?.response?.data;
      const remarksErr = data?.remarks?.[0];
      const message =
        remarksErr ||
        error?.message ||
        data?.detail ||
        "Failed to update equipment status";
      toast.error(
        typeof message === "string" ? message : JSON.stringify(message),
      );
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
              {canManageEquipment && (
              <DialogTrigger asChild>
                <Button variant="accent">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Equipment
                </Button>
              </DialogTrigger>
              )}
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
          <div className="w-full overflow-x-auto overflow-y-visible">
            <table className="w-full min-w-[1200px] text-sm">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap min-w-[140px]">
                    Equipment
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap min-w-[100px]">
                    Department
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap min-w-[100px]">
                    Category
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap min-w-[80px]">
                    Capacity
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider min-w-[220px]">
                    Comment
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider min-w-[180px]">
                    Done by
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap min-w-[100px]">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap min-w-[120px]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {equipment.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-10 text-center text-muted-foreground"
                    >
                      No equipment found. Use &quot;Add Equipment&quot; to
                      register a new item.
                    </td>
                  </tr>
                ) : (
                  equipment.map((item) => {
                    const statusLower = String(item.status || "").toLowerCase();
                    const isCorrectionEntry = !!item.corrects_id;
                    const isRejectedSourceWithCorrections =
                      statusLower === "rejected" &&
                      !isCorrectionEntry &&
                      !!item.has_corrections;
                    const showEditIcon = true;
                    const canEditSourceRejectedEntry =
                      statusLower === "rejected" &&
                      (isCorrectionEntry || !isRejectedSourceWithCorrections);

                    return (
                    <tr
                      key={item.id}
                      className={[
                        "transition-colors",
                        isRejectedSourceWithCorrections ? "bg-red-50/40 hover:bg-red-50/60" : "",
                        !isRejectedSourceWithCorrections
                          ? "hover:bg-muted/30"
                          : "",
                      ].join(" ")}
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
                      <td className="px-4 py-3 text-sm align-middle">
                        {(() => {
                          const statusLower = item.status
                            ? String(item.status).toLowerCase()
                            : "";
                          const text =
                            statusLower === "approved"
                              ? item.approval_comment?.trim()
                              : statusLower === "rejected"
                                ? item.rejection_comment?.trim()
                                : null;
                          const display = text || "—";
                          return (
                            <p
                              className="text-xs text-foreground line-clamp-4 break-words"
                              title={display !== "—" ? display : undefined}
                            >
                              {display}
                            </p>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3 text-sm align-top">
                        <div className="space-y-1.5 min-w-0">
                          <div>
                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground block mb-0.5">
                              Created
                            </span>
                            <span
                              className="text-xs line-clamp-2 break-words"
                              title={item.created_by_name || undefined}
                            >
                              {item.created_by_name || "—"}
                            </span>
                          </div>
                          {(item.status === "approved" ||
                            item.status === "rejected") && (
                            <div>
                              <span className="text-[10px] uppercase tracking-wide text-muted-foreground block mb-0.5">
                                {item.status === "rejected"
                                  ? "Rejected by"
                                  : "Approved by"}
                              </span>
                              <span
                                className="text-xs line-clamp-2 break-words"
                                title={item.approved_by_name || undefined}
                              >
                                {item.approved_by_name || "—"}
                              </span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {(() => {
                          const isCorrection = isCorrectionEntry;

                          const badgeVariant: "success" | "destructive" | "pending" =
                            statusLower === "approved"
                              ? "success"
                              : statusLower === "rejected"
                                ? "destructive"
                                : "pending";

                          const badgeText =
                            statusLower === "pending_secondary_approval"
                              ? "Pending"
                              : item.status
                                ? item.status.charAt(0).toUpperCase() + item.status.slice(1)
                                : "Pending";

                          const helperText =
                            isRejectedSourceWithCorrections
                              ? "Has corrections"
                              : isCorrection && statusLower === "approved"
                                ? "Approved correction entry"
                                : isCorrection
                                  ? "Correction entry"
                                  : null;

                          return (
                            <div className="space-y-1">
                              <Badge variant={badgeVariant}>{badgeText}</Badge>
                              {helperText && (
                                <p
                                  className={[
                                    "text-[11px] whitespace-nowrap",
                                    isRejectedSourceWithCorrections
                                      ? "text-red-600 font-medium"
                                      : isCorrection && statusLower === "approved"
                                        ? "text-emerald-600 font-medium"
                                      : isCorrection
                                        ? "text-amber-600 font-medium"
                                        : "text-muted-foreground",
                                  ].join(" ")}
                                >
                                  {helperText}
                                </p>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {showEditIcon && (
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={!canEditSourceRejectedEntry}
                              className={
                                !canEditSourceRejectedEntry
                                  ? "opacity-70 cursor-not-allowed text-muted-foreground"
                                  : "text-foreground"
                              }
                              onClick={() => {
                                if (!canEditSourceRejectedEntry) return;
                                handleEdit(item);
                              }}
                              title={
                                canEditSourceRejectedEntry
                                  ? "Edit rejected entry (create correction row)"
                                  : "Edit is disabled for original rejected rows that already have corrections"
                              }
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                          )}
                          {canApproveEquipment && (
                            <>
                              {(() => {
                                const statusNorm = item.status
                                  ? String(item.status).toLowerCase()
                                  : "";
                                const isPending =
                                  !statusNorm ||
                                  statusNorm === "pending" ||
                                  statusNorm === "draft" ||
                                  statusNorm === "pending_secondary_approval";
                                const canChangeStatus = isPending;
                                const createdById =
                                  item.created_by == null
                                    ? ""
                                    : typeof item.created_by === "object"
                                      ? String(
                                          (item.created_by as { id: string }).id,
                                        )
                                      : String(item.created_by);
                                const isCreator =
                                  !!createdById &&
                                  createdById === String(user?.id || "");
                                // Creator and approver/rejector must be different users (all roles).
                                const cannotApproveOwnRecord = isCreator;
                                const isBlockedSecondaryApprover =
                                  statusNorm === "pending_secondary_approval" &&
                                  !!item.approved_by_id &&
                                  item.approved_by_id === String(user?.id || "");

                                const handleClick = (
                                  action: "approve" | "reject",
                                ) => {
                                  if (!canChangeStatus) return;
                                  if (cannotApproveOwnRecord) {
                                    toast.error(
                                      action === "approve"
                                        ? "The equipment entry must be approved by a different user than the creator."
                                        : "The equipment entry must be rejected by a different user than the creator.",
                                    );
                                    return;
                                  }
                                  if (action === "approve" && isBlockedSecondaryApprover) {
                                    toast.error(
                                      "A different person must perform secondary approval. The person who rejected cannot approve the corrected entry.",
                                    );
                                    return;
                                  }
                                  setConfirmAction({ id: item.id, action });
                                };

                                return (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      disabled={!canChangeStatus || isBlockedSecondaryApprover}
                                      className={
                                        !canChangeStatus || isBlockedSecondaryApprover
                                          ? "opacity-40 cursor-not-allowed"
                                          : ""
                                      }
                                      onClick={() => handleClick("approve")}
                                      title={
                                        isBlockedSecondaryApprover
                                          ? "A different person must approve this corrected entry."
                                          : "Approve equipment"
                                      }
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
                          {canDeleteEquipment && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeleteConfirmId(item.id)}
                              title="Delete equipment"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )})
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {/* Delete confirmation (centered modal, same pattern as approve/reject) */}
      <AlertDialog
        open={!!deleteConfirmId}
        onOpenChange={(open) => {
          if (!open && !isDeleting) setDeleteConfirmId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete equipment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this equipment? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={isDeleting}
              onClick={async () => {
                if (!deleteConfirmId) return;
                setIsDeleting(true);
                try {
                  await executeDelete(deleteConfirmId);
                } finally {
                  setIsDeleting(false);
                  setDeleteConfirmId(null);
                }
              }}
            >
              {isDeleting ? "Deleting…" : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Step 1: Confirm (matches E Log Book — then comment dialog) */}
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
                ? "Confirm Rejection"
                : "Confirm Approval"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.action === "reject"
                ? "Are you sure you want to reject this equipment? This action cannot be undone."
                : "Are you sure you want to approve this equipment? This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={
                confirmAction?.action === "reject"
                  ? "bg-red-600 hover:bg-red-700 text-white"
                  : "bg-green-600 hover:bg-green-700 text-white"
              }
              onClick={() => {
                const next = confirmAction;
                if (!next) return;
                setConfirmAction(null);
                setActionCommentDialog({
                  id: next.id,
                  action: next.action,
                });
                setActionCommentText("");
              }}
            >
              {confirmAction?.action === "reject" ? "Reject" : "OK"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Step 2: Required approval / rejection comment */}
      <Dialog
        open={!!actionCommentDialog}
        onOpenChange={(open) => {
          if (!open) {
            setActionCommentDialog(null);
            setActionCommentText("");
          }
        }}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>
              {actionCommentDialog?.action === "reject"
                ? "Rejection Comment (Required)"
                : "Approval Comment (Required)"}
            </DialogTitle>
            <DialogDescription>
              {actionCommentDialog?.action === "reject"
                ? "Please enter a comment for this rejection."
                : "Please enter a comment for this approval."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="equipment-action-comment">
                Comment <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="equipment-action-comment"
                value={actionCommentText}
                onChange={(e) => setActionCommentText(e.target.value)}
                placeholder={
                  actionCommentDialog?.action === "reject"
                    ? "Enter rejection comment..."
                    : "Enter approval comment..."
                }
                rows={3}
                className="resize-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setActionCommentDialog(null);
                  setActionCommentText("");
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className={
                  actionCommentDialog?.action === "reject"
                    ? "bg-red-600 hover:bg-red-700 text-white"
                    : "bg-green-600 hover:bg-green-700 text-white"
                }
                onClick={async () => {
                  const comment = actionCommentText.trim();
                  if (!comment) {
                    toast.error(
                      actionCommentDialog?.action === "reject"
                        ? "Comment is required for rejection"
                        : "Comment is required for approval",
                    );
                    return;
                  }
                  if (!actionCommentDialog) return;
                  await handleApproveAction(
                    actionCommentDialog.action,
                    actionCommentDialog.id,
                    comment,
                  );
                  setActionCommentDialog(null);
                  setActionCommentText("");
                }}
              >
                {actionCommentDialog?.action === "reject" ? "Reject" : "Approve"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

