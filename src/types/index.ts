export type EmployeeProfile = {
  id: string;
  name: string;
  employee_id: string;
  email: string;
  phone?: string | null;
  status: "active" | "inactive";
  avatar_url?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type DvrLocation = {
  id: string;
  company_name: string;
  location_name: string;
  location_code: string;
  address: string;
  company_description?: string | null;
  owner_name?: string | null;
  owner_number?: string | null;
  latitude: number;
  longitude: number;
  allowed_radius: number;
  status: "active" | "inactive" | "pending";
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type LocationWithStats = DvrLocation & {
  total_visits: number;
};

export type LocationWithDistance = DvrLocation & {
  distance_meters: number;
  is_inside: boolean;
};

export type DvrVisit = {
  id: string;
  employee_id: string;
  location_id: string;
  visit_purpose: string;
  remarks?: string | null;
  actual_latitude: number;
  actual_longitude: number;
  fixed_latitude: number;
  fixed_longitude: number;
  distance: number;
  gps_accuracy: number;
  photo_path?: string | null;
  visit_date: string;
  visit_time: string;
  status: "submitted" | "verified" | "flagged" | "approved" | "rejected";
  created_at?: string;
};

export type VisitWithRefs = DvrVisit & {
  employee?: EmployeeProfile | null;
  location?: DvrLocation | null;
  signed_photo_url?: string | null;
};

export type EmployeeWithAssignments = EmployeeProfile & {
  assigned_location_ids: string[];
  total_visits: number;
};

export type SessionInfo = {
  userId: string;
  profile: EmployeeProfile | null;
  isAdmin: boolean;
  avatarUrl: string | null;
};
