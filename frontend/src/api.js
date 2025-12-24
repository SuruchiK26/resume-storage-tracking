const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:80";

export const uploadResume = async (formData) => {
  const res = await fetch(`${API_BASE}/api/upload`, {
    method: "POST",
    body: formData,
  });

  return res.json();
};

export const getCandidates = async (skill) => {
  const url = `${API_BASE}/api/candidates${skill ? `?skill=${encodeURIComponent(skill)}` : ""}`;
  const res = await fetch(url);
  return res.json();
};

