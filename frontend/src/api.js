const API_BASE =
  "resume-backend-apis-gjedcub4ehfjbef7.centralindia-01.azurewebsites.net";

export const uploadResume = async (formData) => {
  const res = await fetch(`${API_BASE}/api/upload`, {
    method: "POST",
    body: formData,
  });

  return res.json();
};

export const getCandidates = async () => {
  const res = await fetch(`${API_BASE}/api/candidates`);
  return res.json();
};
