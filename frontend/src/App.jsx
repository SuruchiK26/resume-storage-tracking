import { useEffect, useState } from "react";
import { uploadResume, getCandidates } from "./api";
import "./App.css";

const SKILLS = [
  "Java", "Python", "C++", "C#", "JavaScript", "TypeScript", "React",
  "Angular", "Vue.js", "Node.js", "Express.js", "MongoDB", "SQL", "MySQL",
  "PostgreSQL", "AWS", "Azure", "Google Cloud", "Docker", "Kubernetes",
  "Machine Learning", "Data Science", "HTML", "CSS", "SASS", "Bootstrap",
  "Tailwind CSS", "Git", "REST API", "GraphQL"
];

function App() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [password, setPassword] = useState("");
  const [page, setPage] = useState("upload");
  const [theme, setTheme] = useState("day"); // day or night

  // Upload form
  const [name, setName] = useState("");
  const [selectedSkills, setSelectedSkills] = useState([]);
  const [dropdownSkill, setDropdownSkill] = useState("");
  const [file, setFile] = useState(null);

  // Candidates list
  const [candidates, setCandidates] = useState([]);
  const [filterSkill, setFilterSkill] = useState("");

  useEffect(() => {
    if (isAdmin) loadCandidates();
  }, [isAdmin]);

  useEffect(() => {
    // Set theme class on body
    document.body.className = theme;
  }, [theme]);

  const loadCandidates = async () => {
    const data = await getCandidates();
    setCandidates(data || []);
  };

  const handleAddDropdownSkill = () => {
    if (dropdownSkill && !selectedSkills.includes(dropdownSkill)) {
      setSelectedSkills([...selectedSkills, dropdownSkill]);
    }
    setDropdownSkill("");
  };

  const handleRemoveSkill = (skill) => {
    setSelectedSkills(selectedSkills.filter((s) => s !== skill));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (selectedSkills.length === 0) {
      alert("Please select at least one skill");
      return;
    }

    const formData = new FormData();
    formData.append("name", name);
    formData.append("skills", JSON.stringify(selectedSkills));
    formData.append("resume", file);

    await uploadResume(formData);
    alert("Resume uploaded successfully");

    setName(""); setSelectedSkills([]); setDropdownSkill(""); setFile(null);
    loadCandidates();
  };

  const handleLogin = (e) => {
    e.preventDefault();
    if (password === "admin123") {
      setIsAdmin(true);
    } else {
      alert("Incorrect password");
    }
    setPassword("");
  };

  const filteredCandidates = candidates.filter((c) => {
    return filterSkill ? c.skills.includes(filterSkill) : true;
  });

  if (!isAdmin) {
    return (
      <div className="login-container">
        <div className="login-card">
          <h1>TalentHub</h1>
          <p>Admin Login</p>
          <form onSubmit={handleLogin} className="login-form">
            <input
              type="password"
              placeholder="Enter Admin Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button type="submit">Login</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-text">
          <h1>TalentHub</h1>
        </div>
        <button
          className="theme-toggle"
          onClick={() => setTheme(theme === "day" ? "night" : "day")}
        >
          {theme === "day" ? "🌙 Night Mode" : "☀️ Day Mode"}
        </button>
      </header>

      {/* Navigation */}
      <div className="nav-buttons">
        <button
          className={page === "upload" ? "active" : ""}
          onClick={() => setPage("upload")}
        >
          Upload Resume
        </button>
        <button
          className={page === "search" ? "active" : ""}
          onClick={() => setPage("search")}
        >
          Search Candidates
        </button>
      </div>

      {/* Upload Page */}
      {page === "upload" && (
        <div className="card">
          <h2>Upload Resume</h2>
          <form onSubmit={handleSubmit}>
            <input
              placeholder="Candidate Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />

            <p>Select Skills from dropdown</p>
            <div className="dropdown-skill">
              <select
                value={dropdownSkill}
                onChange={(e) => setDropdownSkill(e.target.value)}
              >
                <option value="">Choose a skill</option>
                {SKILLS.map((skill) => (
                  <option key={skill} value={skill}>
                    {skill}
                  </option>
                ))}
              </select>
              <button type="button" onClick={handleAddDropdownSkill}>
                Add Skill
              </button>
            </div>

            <div className="selected-skills">
              {selectedSkills.map((s) => (
                <span
                  key={s}
                  className="skill active"
                  onClick={() => handleRemoveSkill(s)}
                  title="Click to remove"
                >
                  {s} &times;
                </span>
              ))}
            </div>

            <input
              type="file"
              accept=".pdf"
              onChange={(e) => setFile(e.target.files[0])}
              required
            />

            <button className="submit" type="submit">
              Upload Resume
            </button>
          </form>
        </div>
      )}

      {/* Search Page */}
      {page === "search" && (
        <div className="card">
          <h2>Search Candidates</h2>
          <div className="search-filter">
            <select
              value={filterSkill}
              onChange={(e) => setFilterSkill(e.target.value)}
            >
              <option value="">Filter by Skill</option>
              {SKILLS.map((skill) => (
                <option key={skill} value={skill}>
                  {skill}
                </option>
              ))}
            </select>
          </div>

          <ul>
            {filteredCandidates.map((c) => (
              <li key={c.id}>
                <b>{c.name}</b>
                <div className="skill-list">
                  {c.skills.map((s) => (
                    <span key={s}>{s}</span>
                  ))}
                </div>
                <a href={c.resumeUrl} target="_blank">
                  Download
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default App;
