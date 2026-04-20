import React, { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Plus, Users, Shield, Mail, User, Edit, Trash2, Lock, LockOpen, Eye, EyeOff, ChevronDown } from 'lucide-react';
import { toast } from '@/lib/toast';
import { userAPI, departmentAPI, equipmentAPI } from '@/lib/api';
import { User as UserType } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { PasswordRequirementHints } from '@/components/PasswordRequirementHints';

interface UserData extends UserType {
  site?: string;
}

type DeptRow = { id: string; name: string };
type EquipmentRow = {
  id: string;
  equipment_number?: string;
  name?: string;
  department?: string;
};

const roleLabels: Record<string, string> = {
  operator: 'Operator',
  supervisor: 'Supervisor',
  admin: 'Admin',
  manager: 'Manager',
  super_admin: 'Super Admin',
};

const roleVariants: Record<string, 'default' | 'accent' | 'warning' | 'success'> = {
  operator: 'default',
  supervisor: 'accent',
  admin: 'accent',
  manager: 'warning',
  super_admin: 'success',
};

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserData[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  
  const [departments, setDepartments] = useState<DeptRow[]>([]);
  const [equipmentList, setEquipmentList] = useState<EquipmentRow[]>([]);

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    password_confirm: '',
    role: '',
    is_active: true,
    department_ids: [] as string[],
    equipment_ids: [] as string[],
  });

  const canAssignDeptEquipment =
    currentUser?.role === 'admin' || currentUser?.role === 'super_admin';

  const equipmentForSelectedDepartments = useMemo(() => {
    const deptSet = new Set(formData.department_ids);
    if (!deptSet.size) return [];
    return equipmentList.filter((eq) => eq.department && deptSet.has(String(eq.department)));
  }, [equipmentList, formData.department_ids]);

  const departmentDropdownLabel = useMemo(() => {
    if (!formData.department_ids.length) return 'Select departments…';
    const names = formData.department_ids
      .map((id) => departments.find((d) => d.id === id)?.name)
      .filter(Boolean) as string[];
    if (names.length <= 2) return names.join(', ');
    return `${names.slice(0, 2).join(', ')} +${names.length - 2} more`;
  }, [formData.department_ids, departments]);

  const equipmentDropdownLabel = useMemo(() => {
    if (!formData.department_ids.length) return 'Select departments first…';
    if (!formData.equipment_ids.length) return 'Select equipment…';
    const labels = formData.equipment_ids.map((id) => {
      const eq = equipmentList.find((e) => e.id === id);
      return eq ? [eq.equipment_number, eq.name].filter(Boolean).join(' — ') || id : id;
    });
    if (labels.length <= 2) return labels.join(', ');
    return `${labels.slice(0, 2).join(', ')} +${labels.length - 2} more`;
  }, [formData.department_ids, formData.equipment_ids, equipmentList]);

  const deptTriggerRef = useRef<HTMLButtonElement>(null);
  const equipTriggerRef = useRef<HTMLButtonElement>(null);
  const [deptPopoverWidth, setDeptPopoverWidth] = useState<number>();
  const [equipPopoverWidth, setEquipPopoverWidth] = useState<number>();

  /** Popover panels use the same width as the trigger button (full-width field). */
  useLayoutEffect(() => {
    if (!isDialogOpen || !canAssignDeptEquipment) return;

    const measure = () => {
      setDeptPopoverWidth(deptTriggerRef.current?.offsetWidth ?? undefined);
      setEquipPopoverWidth(equipTriggerRef.current?.offsetWidth ?? undefined);
    };

    measure();
    const raf = window.requestAnimationFrame(measure);
    window.addEventListener('resize', measure);

    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure);
      if (deptTriggerRef.current) ro.observe(deptTriggerRef.current);
      if (equipTriggerRef.current) ro.observe(equipTriggerRef.current);
    }

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', measure);
      ro?.disconnect();
    };
  }, [isDialogOpen, canAssignDeptEquipment, departments.length, equipmentList.length]);

  const toggleDepartment = (id: string) => {
    setFormData((prev) => {
      const next = new Set(prev.department_ids);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      const department_ids = [...next];
      const allowedEqIds = new Set(
        equipmentList
          .filter((eq) => eq.department && department_ids.includes(String(eq.department)))
          .map((eq) => eq.id),
      );
      const equipment_ids = prev.equipment_ids.filter((eid) => allowedEqIds.has(eid));
      return { ...prev, department_ids, equipment_ids };
    });
  };

  const toggleEquipment = (id: string) => {
    setFormData((prev) => {
      const next = new Set(prev.equipment_ids);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...prev, equipment_ids: [...next] };
    });
  };

  useEffect(() => {
    if (!isDialogOpen || !canAssignDeptEquipment) return;
    let cancelled = false;
    (async () => {
      try {
        const [deptRows, eqRows] = await Promise.all([
          departmentAPI.list() as Promise<DeptRow[]>,
          equipmentAPI.listAllPages() as Promise<EquipmentRow[]>,
        ]);
        if (!cancelled) {
          setDepartments(Array.isArray(deptRows) ? deptRows : []);
          setEquipmentList(Array.isArray(eqRows) ? eqRows : []);
        }
      } catch {
        if (!cancelled) {
          setDepartments([]);
          setEquipmentList([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isDialogOpen, canAssignDeptEquipment]);

  // Fetch users on mount
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await userAPI.list();
        // Handle paginated response (results) or direct array
        const userList = Array.isArray(response) ? response : (response.results || response);
        setUsers(userList);
      } catch (error) {
        console.error('Failed to fetch users:', error);
        toast.error('Failed to load users');
      }
    };
    fetchUsers();
  }, []);

  const handleEdit = (user: UserData) => {
    setEditingUserId(user.id);
    setIsEditMode(true);
    setFormData({
      email: user.email,
      password: '',
      password_confirm: '',
      role: user.role,
      is_active: user.is_active ?? true,
      department_ids: Array.isArray(user.department_ids) ? [...user.department_ids] : [],
      equipment_ids: Array.isArray(user.equipment_ids) ? [...user.equipment_ids] : [],
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate password confirmation if password is provided
    if (formData.password && formData.password !== formData.password_confirm) {
      toast.error('Passwords do not match');
      return;
    }
    
    setIsLoading(true);

    try {
      if (isEditMode && editingUserId) {
        // Update existing user
        const updateData: any = {
      email: formData.email,
          role: formData.role,
          is_active: formData.is_active,
        };
        
        // Only include password if it's provided
        if (formData.password) {
          if (formData.password.length < 8) {
            toast.error('Password must contain at least 8 characters');
            setIsLoading(false);
            return;
          }
          updateData.password = formData.password;
          updateData.password_confirm = formData.password_confirm;
        }

        if (canAssignDeptEquipment) {
          updateData.department_ids = formData.department_ids;
          updateData.equipment_ids = formData.equipment_ids;
        }

        const updatedUser = await userAPI.update(editingUserId, updateData);
        setUsers(users.map(u => u.id === editingUserId ? updatedUser : u));
        setIsDialogOpen(false);
        setIsEditMode(false);
        setEditingUserId(null);
        setFormData({
          email: '',
          password: '',
          password_confirm: '',
          role: '',
          is_active: true,
          department_ids: [],
          equipment_ids: [],
        });
        if (formData.password) {
          toast.success('Password changed successfully.');
        } else if (formData.is_active === false) {
          toast.success('User account becomes inactive.');
        } else {
          toast.success('User updated successfully.');
        }
      } else {
        // Create new user
        const createPayload: Record<string, unknown> = {
          email: formData.email,
          password: formData.password,
          password_confirm: formData.password_confirm,
          role: formData.role,
          is_active: formData.is_active,
        };
        if (canAssignDeptEquipment) {
          createPayload.department_ids = formData.department_ids;
          createPayload.equipment_ids = formData.equipment_ids;
        }
        const newUser = await userAPI.create(createPayload);

        setUsers([newUser, ...users]);
        setIsDialogOpen(false);
        setFormData({
          email: '',
          password: '',
          password_confirm: '',
          role: '',
          is_active: true,
          department_ids: [],
          equipment_ids: [],
        });
        toast.success('User created and role assigned successfully.');
      }
    } catch (error: any) {
      console.error('Create user error:', error);
      
      // Handle different error response formats
      let errorMessage = 'Failed to create user';
      
      if (error?.response?.data) {
        const errorData = error.response.data;
        
        // Handle validation errors (field-specific)
        if (errorData.email) {
          const emailErr = Array.isArray(errorData.email) ? errorData.email[0] : errorData.email;
          errorMessage = typeof emailErr === 'string' && (emailErr.includes('already exists') || emailErr.toLowerCase().includes('duplicate'))
            ? 'Duplicate email not allowed.'
            : emailErr;
        } else if (errorData.password) {
          errorMessage = Array.isArray(errorData.password) ? errorData.password[0] : errorData.password;
        } else if (errorData.password_confirm) {
          errorMessage = Array.isArray(errorData.password_confirm) ? errorData.password_confirm[0] : errorData.password_confirm;
        } else if (errorData.role) {
          errorMessage = Array.isArray(errorData.role) ? errorData.role[0] : errorData.role;
        } else if (errorData.non_field_errors) {
          errorMessage = Array.isArray(errorData.non_field_errors) ? errorData.non_field_errors[0] : errorData.non_field_errors;
        } else if (errorData.detail) {
          errorMessage = errorData.detail;
        } else if (errorData.error) {
          errorMessage = errorData.error;
        } else if (typeof errorData === 'string') {
          errorMessage = errorData;
        } else if (Object.keys(errorData).length > 0) {
          // Get first error message from any field
          const firstError = Object.values(errorData)[0];
          errorMessage = Array.isArray(firstError) ? firstError[0] : String(firstError);
        }
      } else if (error?.message) {
        errorMessage = error.message;
      }
      
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmId) return;
    setDeleteSubmitting(true);
    try {
      await userAPI.delete(deleteConfirmId);
      setUsers((prev) => prev.filter((u) => u.id !== deleteConfirmId));
      toast.success('User deleted successfully');
      setDeleteConfirmId(null);
    } catch (error: any) {
      const errorMessage =
        error?.response?.data?.error || error?.response?.data?.detail || 'Failed to delete user';
      toast.error(errorMessage);
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const handleUnlock = async (userId: string) => {
    try {
      await userAPI.unlock(userId);
      const response = await userAPI.list();
      const userList = Array.isArray(response) ? response : (response.results || response);
      setUsers(userList);
      toast.success('User unlocked successfully.');
    } catch (error: any) {
      const errorMessage = error?.response?.data?.error || error?.response?.data?.detail || error?.message || 'Failed to unlock user';
      toast.error(errorMessage);
    }
  };

  if (currentUser?.role !== 'admin' && currentUser?.role !== 'super_admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen">
      <Header
        title="User Management"
        subtitle="Manage system users and access control"
      />

      <div className="p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="metric-card">
            <p className="data-label">Total Users</p>
            <p className="reading-display text-2xl">{users.length}</p>
          </div>
          <div className="metric-card">
            <p className="data-label">Operators</p>
            <p className="reading-display text-2xl">{users.filter(u => u.role === 'operator').length}</p>
          </div>
          <div className="metric-card">
            <p className="data-label">Supervisors</p>
            <p className="reading-display text-2xl">{users.filter(u => u.role === 'supervisor').length}</p>
          </div>
          <div className="metric-card">
            <p className="data-label">Managers</p>
            <p className="reading-display text-2xl">{users.filter(u => u.role === 'manager').length}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="success">{users.filter(u => u.is_active).length} Active</Badge>
            <Badge variant="secondary">{users.filter(u => !u.is_active).length} Inactive</Badge>
          </div>

          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) {
              setIsEditMode(false);
              setEditingUserId(null);
              setFormData({
                email: '',
                password: '',
                password_confirm: '',
                role: '',
                is_active: true,
                department_ids: [],
                equipment_ids: [],
              });
            }
          }}>
            <DialogTrigger asChild>
              <Button variant="accent">
                <Plus className="w-4 h-4 mr-2" />
                Add User
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[560px] max-h-[85vh] min-h-0 flex flex-col gap-4 overflow-visible p-6 pt-10">
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 -mr-1 [scrollbar-gutter:stable]">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    {isEditMode ? 'Edit User' : 'Create New User'}
                  </DialogTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    {isEditMode 
                      ? 'Update user information. Leave password fields empty to keep the current password.'
                      : "First, enter an email and password. Then, you'll be able to edit more user options."}
                  </p>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">
                    <Mail className="w-4 h-4 inline mr-2" />
                    Email <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="user@example.com"
                    required
                    autoComplete="email"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">
                    <Lock className="w-4 h-4 inline mr-2" />
                    Password {!isEditMode && <span className="text-destructive">*</span>}
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      placeholder={isEditMode ? "Leave empty to keep current password" : "Enter password"}
                      required={!isEditMode}
                      autoComplete="new-password"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {(!isEditMode || formData.password) && (
                    <PasswordRequirementHints password={formData.password} className="mt-2" compact />
                  )}
                  {isEditMode && !formData.password && (
                    <p className="text-xs text-muted-foreground">
                      Leave empty to keep the current password.
                    </p>
                  )}
                </div>

                {(!isEditMode || formData.password) && (
                  <div className="space-y-2">
                    <Label htmlFor="password_confirm">
                      <Lock className="w-4 h-4 inline mr-2" />
                      Password confirmation {!isEditMode && <span className="text-destructive">*</span>}
                    </Label>
                    <div className="relative">
                      <Input
                        id="password_confirm"
                        type={showPasswordConfirm ? 'text' : 'password'}
                        value={formData.password_confirm}
                        onChange={(e) => setFormData({ ...formData, password_confirm: e.target.value })}
                        placeholder="Enter the same password as before, for verification"
                        required={!isEditMode || !!formData.password}
                        autoComplete="new-password"
                        className="pr-10"
                      />
                      <button
                        type="button"
                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
                        onClick={() => setShowPasswordConfirm((prev) => !prev)}
                        aria-label={showPasswordConfirm ? 'Hide password confirmation' : 'Show password confirmation'}
                      >
                        {showPasswordConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Enter the same password as before, for verification.
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="role">
                    <Shield className="w-4 h-4 inline mr-2" />
                    Role <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={formData.role}
                    onValueChange={(v) => setFormData({ ...formData, role: v })}
                    required
                  >
                    <SelectTrigger id="role">
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      {/* Super Admin can create Admin, Supervisor, Operator, Manager (not Super Admin) */}
                      {currentUser?.role === 'super_admin' && (
                        <>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="supervisor">Supervisor</SelectItem>
                          <SelectItem value="operator">Operator</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                        </>
                      )}
                      {/* Admin can create Admin, Supervisor, Operator, Manager (not Super Admin) */}
                      {currentUser?.role === 'admin' && (
                        <>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="supervisor">Supervisor</SelectItem>
                      <SelectItem value="operator">Operator</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                        </>
                      )}
                      {/* Fallback: Show limited roles if user role is not set or unknown */}
                      {currentUser?.role !== 'super_admin' && currentUser?.role !== 'admin' && (
                        <>
                      <SelectItem value="supervisor">Supervisor</SelectItem>
                          <SelectItem value="operator">Operator</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {canAssignDeptEquipment && (
                  <div className="space-y-4 pt-2 border-t border-border">
                    <div className="space-y-2">
                      <Label htmlFor="departments-dropdown">Departments</Label>
                      <p className="text-xs text-muted-foreground">
                        Open the dropdown and tick one or more departments. Equipment updates immediately.
                      </p>
                      <Popover modal={false}>
                        <PopoverTrigger asChild>
                          <Button
                            ref={deptTriggerRef}
                            id="departments-dropdown"
                            type="button"
                            variant="outline"
                            className="w-full justify-between font-normal text-left min-h-10 h-auto py-2"
                          >
                            <span className="truncate text-left">{departmentDropdownLabel}</span>
                            <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          className="z-[100] flex max-h-[min(200px,28vh)] flex-col overflow-hidden p-0 max-w-[calc(100vw-2rem)]"
                          align="start"
                          side="bottom"
                          sideOffset={4}
                          avoidCollisions={false}
                          style={deptPopoverWidth ? { width: deptPopoverWidth } : undefined}
                        >
                          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 pr-3 space-y-2 [scrollbar-gutter:stable]">
                            {departments.map((d) => (
                              <div key={d.id} className="flex items-center space-x-2 shrink-0">
                                <Checkbox
                                  id={`dept-${d.id}`}
                                  checked={formData.department_ids.includes(d.id)}
                                  onCheckedChange={() => toggleDepartment(d.id)}
                                />
                                <Label htmlFor={`dept-${d.id}`} className="text-sm font-normal cursor-pointer leading-snug">
                                  {d.name}
                                </Label>
                              </div>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="equipment-dropdown">Equipment</Label>
                      <p className="text-xs text-muted-foreground">
                        Dropdown lists only equipment in the departments you selected. Validate on save.
                      </p>
                      <Popover modal={false}>
                        <PopoverTrigger asChild>
                          <Button
                            ref={equipTriggerRef}
                            id="equipment-dropdown"
                            type="button"
                            variant="outline"
                            className="w-full justify-between font-normal text-left min-h-10 h-auto py-2"
                            disabled={!formData.department_ids.length}
                          >
                            <span className="truncate text-left">{equipmentDropdownLabel}</span>
                            <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          className="z-[100] flex max-h-[min(200px,28vh)] flex-col overflow-hidden p-0 max-w-[calc(100vw-2rem)]"
                          align="start"
                          side="bottom"
                          sideOffset={4}
                          avoidCollisions={false}
                          style={equipPopoverWidth ? { width: equipPopoverWidth } : undefined}
                        >
                          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 pr-3 space-y-2 [scrollbar-gutter:stable]">
                            {!formData.department_ids.length ? (
                              <p className="text-xs text-muted-foreground px-1 py-2">Select at least one department first.</p>
                            ) : equipmentForSelectedDepartments.length === 0 ? (
                              <p className="text-xs text-muted-foreground px-1 py-2">No equipment for these departments.</p>
                            ) : (
                              equipmentForSelectedDepartments.map((eq) => (
                                <div key={eq.id} className="flex items-center space-x-2 shrink-0">
                                  <Checkbox
                                    id={`eq-${eq.id}`}
                                    checked={formData.equipment_ids.includes(eq.id)}
                                    onCheckedChange={() => toggleEquipment(eq.id)}
                                  />
                                  <Label htmlFor={`eq-${eq.id}`} className="text-sm font-normal cursor-pointer leading-snug">
                                    {[eq.equipment_number, eq.name].filter(Boolean).join(' — ') || eq.id}
                                  </Label>
                                </div>
                              ))
                            )}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                )}

                <div className="space-y-3 pt-2 border-t border-border">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="is_active"
                      checked={formData.is_active}
                      onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked as boolean })}
                    />
                    <Label htmlFor="is_active" className="text-sm font-normal cursor-pointer">
                      Is active
                  </Label>
                  </div>
                  <p className="text-xs text-muted-foreground ml-6">
                    Designates whether this user should be treated as active. Unselect this instead of deleting accounts.
                  </p>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="accent" disabled={isLoading}>
                    {isLoading ? (isEditMode ? 'Updating...' : 'Creating...') : (isEditMode ? 'Update User' : 'Create User')}
                  </Button>
                </div>
              </form>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Users Table */}
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">User</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Role</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-12 text-center text-muted-foreground">
                      <p className="text-sm">No users found</p>
                      <p className="text-xs mt-1">Users will appear here once created</p>
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                  <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-accent/10 flex items-center justify-center">
                          <span className="text-sm font-medium text-accent">
                            {user.name 
                              ? user.name.split(' ').map(n => n[0]).join('').toUpperCase()
                              : user.email.substring(0, 2).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{user.name || user.email}</p>
                          <p className="text-xs text-muted-foreground">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={roleVariants[user.role] || 'default'}>
                        {roleLabels[user.role] || user.role}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant={user.is_active ? 'success' : 'secondary'}>
                          {user.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                        {user.is_locked && (
                          <Badge variant="warning">Locked</Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {user.is_locked && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleUnlock(user.id)}
                            title="Unlock user"
                          >
                            <LockOpen className="w-4 h-4" />
                          </Button>
                        )}
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => handleEdit(user)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        {(currentUser?.role === 'super_admin' || currentUser?.role === 'admin') &&
                          user.id !== currentUser?.id &&
                          user.role !== 'super_admin' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteConfirmId(user.id)}
                            title="Delete user"
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
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

      <AlertDialog
        open={!!deleteConfirmId}
        onOpenChange={(open) => {
          if (!open && !deleteSubmitting) setDeleteConfirmId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this user? The account will be deactivated and removed
              from the active user list.
            </AlertDialogDescription>
            {deleteConfirmId ? (
              <p className="text-sm font-medium text-foreground -mt-1">
                {users.find((u) => u.id === deleteConfirmId)?.email ?? deleteConfirmId}
              </p>
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteSubmitting}
              onClick={(e) => {
                e.preventDefault();
                void handleDeleteConfirm();
              }}
            >
              {deleteSubmitting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
