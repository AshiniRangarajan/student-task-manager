import { useCallback, useEffect, useMemo, useState } from "react";
import "./styles.css";

const CATEGORIES = [
  "Wi-Fi",
  "Classroom projectors",
  "Drinking water",
  "Laboratory equipment",
  "Washrooms",
  "Hostel maintenance"
];
const DEPARTMENTS = [
  "Arts & Humanities",
  "Business",
  "Computer Science",
  "Engineering",
  "Life Sciences",
  "Physical Sciences",
  "Other"
];
const STATUSES = ["Pending", "In Progress", "Resolved"];
const EMPTY_FORM = { category: "", description: "" };

async function apiRequest(url, options = {}, csrfToken = "") {
  const headers = { ...options.headers };
  if (csrfToken && (options.method || "GET").toUpperCase() !== "GET") {
    headers["X-CSRF-Token"] = csrfToken;
  }

  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
      credentials: "same-origin"
    });
  } catch {
    throw new Error("Cannot connect to the campus server. Check that Flask is running.");
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("The server returned an invalid response. Please try again.");
  }
  if (!response.ok) {
    const error = new Error(payload.error || "The request could not be completed.");
    error.status = response.status;
    throw error;
  }
  return payload;
}

function useNavigation() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const handlePopState = () => setPath(window.location.pathname);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = useCallback((nextPath, replace = false) => {
    if (window.location.pathname !== nextPath) {
      const method = replace ? "replaceState" : "pushState";
      window.history[method]({}, "", nextPath);
    }
    setPath(nextPath);
  }, []);

  return [path, navigate];
}

function AppLink({ to, navigate, className = "", children, ...attributes }) {
  return (
    <a
      {...attributes}
      href={to}
      className={className}
      onClick={event => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function StatusBadge({ status }) {
  const className = `status-${status.toLowerCase().replace(/\s+/g, "-")}`;
  return <span className={`status-badge ${className}`}>{status}</span>;
}

function Header({ user, navigate, onLogout }) {
  return (
    <header className="topbar">
      <AppLink className="brand" to="/" navigate={navigate} aria-label="CampusCare home">
        <span className="brand-mark" aria-hidden="true">C</span>
        <span>Campus<span className="brand-accent">Care</span></span>
      </AppLink>
      <nav className="main-nav" aria-label="Account navigation">
        {user ? (
          <>
            <span className="account-label">{user.name} · {user.role === "admin" ? "Administrator" : user.department}</span>
            <button className="logout-button" type="button" onClick={onLogout}>Log out</button>
          </>
        ) : (
          <>
            <AppLink className="nav-link" to="/student/login" navigate={navigate}>Student Login</AppLink>
            <AppLink className="nav-link" to="/admin/login" navigate={navigate}>Admin Login</AppLink>
          </>
        )}
      </nav>
    </header>
  );
}

function Hero() {
  return (
    <section className="hero">
      <div className="hero-copy">
        <p className="eyebrow"><span className="eyebrow-line" /> SMART CAMPUS SERVICES</p>
        <h1>A better campus<br />starts with <span>being heard.</span></h1>
        <p className="hero-description">Report an issue, follow its progress, and help make everyday campus life better for everyone.</p>
      </div>
      <div className="hero-art" aria-hidden="true">
        <div className="art-orbit orbit-one" />
        <div className="art-orbit orbit-two" />
        <div className="art-card">
          <div className="art-card-top"><span className="art-icon">✓</span><span className="art-status">ISSUE TRACKED</span></div>
          <div className="art-lines"><i /><i /><i /></div>
          <div className="art-progress"><span /></div>
          <div className="art-card-bottom"><span>Campus care team</span><b>● Active</b></div>
        </div>
        <span className="art-spark spark-one">✦</span><span className="art-spark spark-two">✳</span>
      </div>
    </section>
  );
}

function LandingPage({ navigate }) {
  return (
    <main className="page-shell">
      <Hero />
      <section className="landing-section">
        <div className="section-heading">
          <div><p className="eyebrow">WELCOME TO CAMPUSCARE</p><h2>Choose your portal</h2></div>
          <p>Sign in to report and manage campus issues.</p>
        </div>
        <div className="portal-choice-grid">
          <article className="portal-choice student-choice">
            <span className="choice-icon" aria-hidden="true">✦</span>
            <p className="eyebrow">FOR STUDENTS</p>
            <h3>Student Portal</h3>
            <p>Submit a complaint, view your reports, and follow each update in one place.</p>
            <AppLink to="/student/login" navigate={navigate} className="button button-primary">Student Login <span aria-hidden="true">→</span></AppLink>
            <p className="choice-footnote">New to CampusCare? <AppLink to="/student/register" navigate={navigate}>Create a student account</AppLink></p>
          </article>
          <article className="portal-choice admin-choice">
            <span className="choice-icon" aria-hidden="true">▤</span>
            <p className="eyebrow">FOR CAMPUS STAFF</p>
            <h3>Admin Dashboard</h3>
            <p>Review all reports, prioritize issues, and update students on their progress.</p>
            <AppLink to="/admin/login" navigate={navigate} className="button button-dark">Admin Login <span aria-hidden="true">→</span></AppLink>
            <p className="choice-footnote">Admin accounts are created by the system administrator.</p>
          </article>
        </div>
      </section>
    </main>
  );
}

function AuthPage({ role, register, csrfToken, canAuthenticate, navigate, onAuthenticated }) {
  const [form, setForm] = useState({
    name: "",
    department: "",
    email: "",
    password: "",
    confirmPassword: ""
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const isAdmin = role === "admin";

  function updateField(event) {
    const { name, value } = event.target;
    setForm(current => ({ ...current, [name]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (register && form.password !== form.confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    setSubmitting(true);
    const endpoint = register
      ? "/api/auth/student/register"
      : `/api/auth/${role}/login`;
    const body = register
      ? {
          name: form.name.trim(),
          department: form.department,
          email: form.email.trim(),
          password: form.password
        }
      : { email: form.email.trim(), password: form.password };

    try {
      const result = await apiRequest(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      }, csrfToken);
      onAuthenticated(result);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="authTitle">
        <AppLink to="/" navigate={navigate} className="back-link">← Back to home</AppLink>
        <div className={`auth-icon ${isAdmin ? "admin-auth-icon" : ""}`} aria-hidden="true">{isAdmin ? "▤" : "✦"}</div>
        <p className="eyebrow">{register ? "GET STARTED" : isAdmin ? "CAMPUS STAFF" : "STUDENT ACCESS"}</p>
        <h1 id="authTitle">{register ? "Create your account" : `${isAdmin ? "Admin" : "Student"} login`}</h1>
        <p className="auth-description">
          {register
            ? "Register with your email to submit and track your own reports."
            : isAdmin
              ? "Sign in with your authorized administrator account."
              : "Sign in to report campus issues and follow their progress."}
        </p>
        <form className="auth-form" onSubmit={submit}>
          {register && (
            <>
              <label className="field">Full name
                <input name="name" value={form.name} onChange={updateField} type="text" autoComplete="name" maxLength="80" required />
              </label>
              <label className="field">Department
                <select name="department" value={form.department} onChange={updateField} required>
                  <option value="" disabled>Select your department</option>
                  {DEPARTMENTS.map(item => <option key={item}>{item}</option>)}
                </select>
              </label>
            </>
          )}
          <label className="field">Email address
            <input name="email" value={form.email} onChange={updateField} type="email" autoComplete="email" maxLength="254" required />
          </label>
          <label className="field">Password
            <input name="password" value={form.password} onChange={updateField} type="password" autoComplete={register ? "new-password" : "current-password"} minLength={register ? 8 : undefined} maxLength="128" required />
            {register && <span className="field-hint">Use at least 8 characters.</span>}
          </label>
          {register && (
            <label className="field">Confirm password
              <input name="confirmPassword" value={form.confirmPassword} onChange={updateField} type="password" autoComplete="new-password" minLength="8" maxLength="128" required />
            </label>
          )}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className={`button ${isAdmin ? "button-dark" : "button-primary"} auth-submit`} type="submit" disabled={submitting || !canAuthenticate}>
            {submitting ? "Please wait…" : register ? "Create student account" : "Sign in"}
          </button>
        </form>
        {register ? (
          <p className="auth-switch">Already registered? <AppLink to="/student/login" navigate={navigate}>Student login</AppLink></p>
        ) : isAdmin ? (
          <p className="auth-switch">Admin accounts are provisioned by configuring the server, not through public registration.</p>
        ) : (
          <p className="auth-switch">New to CampusCare? <AppLink to="/student/register" navigate={navigate}>Create a student account</AppLink></p>
        )}
      </section>
    </main>
  );
}

function StudentPortal({ user, complaints, csrfToken, onCreated, notify }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [searchId, setSearchId] = useState("");
  const [searchResult, setSearchResult] = useState(null);
  const [searchMessage, setSearchMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function updateField(event) {
    const { name, value } = event.target;
    setForm(current => ({ ...current, [name]: value }));
  }

  async function submitComplaint(event) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await apiRequest("/api/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      }, csrfToken);
      setForm(EMPTY_FORM);
      setSearchId(result.complaint.id);
      setSearchResult(result.complaint);
      setSearchMessage("");
      await onCreated();
      notify(`Complaint submitted. Your ID is ${result.complaint.id}`);
    } catch (error) {
      notify(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function searchComplaint(event) {
    event.preventDefault();
    const id = searchId.trim();
    if (!id) {
      notify("Enter a complaint ID to search.");
      return;
    }
    try {
      const result = await apiRequest(`/api/complaints/${encodeURIComponent(id)}`);
      setSearchResult(result.complaint);
      setSearchMessage("");
    } catch (error) {
      if (error.status === 404) {
        setSearchResult(null);
        setSearchMessage("We couldn’t find one of your complaints with that ID.");
      } else {
        notify(error.message);
      }
    }
  }

  function selectComplaint(complaint) {
    setSearchId(complaint.id);
    setSearchResult(complaint);
    setSearchMessage("");
  }

  return (
    <>
      <div className="section-heading">
        <div><p className="eyebrow">YOUR VOICE MATTERS</p><h2>Student portal</h2></div>
        <p>Submit a campus issue or check in on one you’ve already reported.</p>
      </div>
      <div className="student-grid">
        <section className="panel form-panel" aria-labelledby="reportTitle">
          <div className="panel-heading">
            <div className="panel-icon purple-icon" aria-hidden="true">＋</div>
            <div><h3 id="reportTitle">Report an issue</h3><p>We’ll get it to the right team.</p></div>
          </div>
          <form onSubmit={submitComplaint}>
            <div className="form-row">
              <label className="field">Your name
                <input value={user.name} readOnly aria-readonly="true" />
              </label>
              <label className="field">Department
                <input value={user.department} readOnly aria-readonly="true" />
              </label>
            </div>
            <label className="field">Issue category
              <select name="category" value={form.category} onChange={updateField} required>
                <option value="" disabled>Choose a category</option>
                {CATEGORIES.map(item => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label className="field">Tell us what happened
              <textarea name="description" value={form.description} onChange={updateField} rows="4" placeholder="Include the location and any details that will help us resolve this..." minLength="10" maxLength="1000" required />
              <span className="field-hint">At least 10 characters, up to 1,000.</span>
            </label>
            <button className="button button-primary submit-button" type="submit" disabled={submitting}>
              {submitting ? "Submitting…" : <>Submit complaint <span aria-hidden="true">→</span></>}
            </button>
            <p className="privacy-note"><span aria-hidden="true">▣</span> You can only view your own reports.</p>
          </form>
        </section>

        <section className="panel tracking-panel" aria-labelledby="trackTitle">
          <div className="panel-heading">
            <div className="panel-icon blue-icon" aria-hidden="true">⌕</div>
            <div><h3 id="trackTitle">Track a complaint</h3><p>Enter your complaint ID to find an update.</p></div>
          </div>
          <form className="search-form" onSubmit={searchComplaint}>
            <label className="field" htmlFor="searchId">Complaint ID</label>
            <div className="search-control">
              <input id="searchId" type="search" value={searchId} onChange={event => setSearchId(event.target.value)} placeholder="e.g. CMP-20260410-A1B2C3" autoComplete="off" />
              <button className="button button-dark" type="submit">Search</button>
            </div>
          </form>
          {searchResult ? (
            <div className="search-result found" aria-live="polite">
              <div className="result-top">
                <div><span className="result-id">{searchResult.id}</span><h4>{searchResult.category}</h4></div>
                <StatusBadge status={searchResult.status} />
              </div>
              <p className="result-description">{searchResult.description}</p>
              <div className="result-meta"><span>Submitted {formatDate(searchResult.created_at)}</span><span>{searchResult.department}</span></div>
            </div>
          ) : (
            <div className="search-result empty-state" aria-live="polite">
              <div className="empty-illustration" aria-hidden="true">{searchMessage ? "?" : "⌕"}</div>
              <h4>{searchMessage ? "Complaint not found" : "Your updates, all in one place"}</h4>
              <p>{searchMessage || "Search with the ID you received after submitting a complaint."}</p>
            </div>
          )}
          <div className="my-reports">
            <div className="subheading-row"><h4>My reports</h4><span className="count-pill">{complaints.length}</span></div>
            <div className="report-list">
              {complaints.map(complaint => (
                <button className="report-item report-item-button" key={complaint.id} type="button" onClick={() => selectComplaint(complaint)}>
                  <span className="report-item-main">
                    <span className="report-item-id">{complaint.id}</span>
                    <span className="report-item-category">{complaint.category} · {formatDate(complaint.created_at)}</span>
                  </span>
                  <StatusBadge status={complaint.status} />
                </button>
              ))}
              {complaints.length === 0 && <p className="no-reports">Your submitted complaints will appear here.</p>}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

function StatCard({ icon, label, value, caption, className }) {
  return (
    <article className="stat-card">
      <span className={`stat-icon ${className}`} aria-hidden="true">{icon}</span>
      <span className="stat-label">{label}</span>
      <strong>{value}</strong>
      <span className="stat-caption">{caption}</span>
    </article>
  );
}

function AdminDashboard({ complaints, stats, csrfToken, onStatusChange, notify }) {
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [loadingId, setLoadingId] = useState("");
  const filteredComplaints = complaints.filter(item =>
    (!category || item.category === category) && (!status || item.status === status)
  );

  async function changeStatus(id, nextStatus) {
    setLoadingId(id);
    try {
      await apiRequest(`/api/complaints/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus })
      }, csrfToken);
      await onStatusChange();
      notify(`${id} updated to ${nextStatus}.`);
    } catch (error) {
      notify(error.message);
    } finally {
      setLoadingId("");
    }
  }

  return (
    <>
      <div className="section-heading admin-heading">
        <div><p className="eyebrow">CAMPUS OPERATIONS</p><h2>Admin dashboard</h2></div>
        <p>Review incoming reports and keep students informed.</p>
      </div>
      <div className="stats-grid" aria-label="Complaint summary">
        <StatCard icon="▤" label="Total complaints" value={stats.total} caption="All reports received" className="total-icon" />
        <StatCard icon="◷" label="Pending" value={stats.pending} caption="Awaiting review" className="pending-icon" />
        <StatCard icon="↻" label="In progress" value={stats.in_progress} caption="Being worked on" className="progress-icon" />
        <StatCard icon="✓" label="Resolved" value={stats.resolved} caption="Successfully completed" className="resolved-icon" />
      </div>
      <section className="panel table-panel">
        <div className="table-heading">
          <div><h3>All complaints</h3><p>Review reports and update their status.</p></div>
          <div className="filters">
            <label className="visually-hidden" htmlFor="categoryFilter">Filter by category</label>
            <select id="categoryFilter" value={category} onChange={event => setCategory(event.target.value)}>
              <option value="">All categories</option>
              {CATEGORIES.map(item => <option key={item}>{item}</option>)}
            </select>
            <label className="visually-hidden" htmlFor="statusFilter">Filter by status</label>
            <select id="statusFilter" value={status} onChange={event => setStatus(event.target.value)}>
              <option value="">All statuses</option>
              {STATUSES.map(item => <option key={item}>{item}</option>)}
            </select>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Complaint</th><th>Student</th><th>Category</th><th>Description</th><th>Submitted</th><th>Status</th></tr></thead>
            <tbody>
              {filteredComplaints.map(complaint => (
                <tr key={complaint.id}>
                  <td><span className="complaint-id">{complaint.id}</span><span className="table-sub">{complaint.department}</span></td>
                  <td className="student-cell">{complaint.name}</td>
                  <td className="category-cell">{complaint.category}</td>
                  <td className="description-cell" title={complaint.description}>{complaint.description}</td>
                  <td className="date-cell">{formatDate(complaint.created_at)}</td>
                  <td>
                    <label className="visually-hidden" htmlFor={`status-${complaint.id}`}>Status for {complaint.id}</label>
                    <select className="status-select" id={`status-${complaint.id}`} value={complaint.status} disabled={loadingId === complaint.id} onChange={event => changeStatus(complaint.id, event.target.value)}>
                      {STATUSES.map(item => <option key={item}>{item}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredComplaints.length === 0 && (
            <div className="table-empty"><span aria-hidden="true">✦</span><h4>No complaints to show</h4><p>Submitted complaints will appear here.</p></div>
          )}
        </div>
        <div className="table-footer"><span>Showing {filteredComplaints.length} of {complaints.length} complaint{complaints.length === 1 ? "" : "s"}</span><span className="demo-note">Changes are saved in MongoDB</span></div>
      </section>
    </>
  );
}

export default function App() {
  const [path, navigate] = useNavigation();
  const [user, setUser] = useState(null);
  const [csrfToken, setCsrfToken] = useState("");
  const [authReady, setAuthReady] = useState(false);
  const [authLoadError, setAuthLoadError] = useState("");
  const [complaints, setComplaints] = useState([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, in_progress: 0, resolved: 0 });
  const [dataLoading, setDataLoading] = useState(false);
  const [pageError, setPageError] = useState("");
  const [toast, setToast] = useState("");
  const recentFirstComplaints = useMemo(
    () => [...complaints].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    [complaints]
  );

  useEffect(() => {
    let active = true;
    apiRequest("/api/auth/me")
      .then(result => {
        if (!active) return;
        setUser(result.user);
        setCsrfToken(result.csrf_token);
      })
      .catch(error => {
        if (active) setAuthLoadError(error.message);
      })
      .finally(() => {
        if (active) setAuthReady(true);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!authReady) return;
    const studentLogin = path === "/student/login" || path === "/student/register";
    const adminLogin = path === "/admin/login";
    const studentDashboard = path === "/student/dashboard";
    const adminDashboard = path === "/admin/dashboard";

    if (user) {
      const home = user.role === "admin" ? "/admin/dashboard" : "/student/dashboard";
      if (user.role === "admin" && !adminDashboard) navigate(home, true);
      else if (user.role === "student" && !studentDashboard) navigate(home, true);
      return;
    }
    if (studentDashboard) navigate("/student/login", true);
    else if (adminDashboard) navigate("/admin/login", true);
    else if (path !== "/" && !studentLogin && !adminLogin) navigate("/", true);
  }, [authReady, navigate, path, user]);

  const refreshData = useCallback(async () => {
    if (!user) return;
    setDataLoading(true);
    try {
      const complaintResult = await apiRequest("/api/complaints");
      setComplaints(complaintResult.complaints);
      if (user.role === "admin") {
        setStats(await apiRequest("/api/stats"));
      }
      setPageError("");
    } finally {
      setDataLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authReady || !user) return;
    const dashboard = user.role === "admin" ? "/admin/dashboard" : "/student/dashboard";
    if (path !== dashboard) return;
    refreshData().catch(error => {
      if (error.status === 401) {
        setUser(null);
        navigate(user.role === "admin" ? "/admin/login" : "/student/login", true);
      } else {
        setPageError(error.message);
      }
    });
  }, [authReady, navigate, path, refreshData, user]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function handleAuthenticated(result) {
    setUser(result.user);
    setCsrfToken(result.csrf_token);
    setComplaints([]);
    navigate(result.user.role === "admin" ? "/admin/dashboard" : "/student/dashboard", true);
  }

  async function logout() {
    try {
      const result = await apiRequest("/api/auth/logout", { method: "POST" }, csrfToken);
      setCsrfToken(result.csrf_token);
      const loginPath = user?.role === "admin" ? "/admin/login" : "/student/login";
      setUser(null);
      setComplaints([]);
      setStats({ total: 0, pending: 0, in_progress: 0, resolved: 0 });
      navigate(loginPath, true);
    } catch (error) {
      setToast(error.message);
    }
  }

  if (!authReady) {
    return <main className="loading-screen" aria-live="polite">Connecting to CampusCare…</main>;
  }

  const isStudentRegister = path === "/student/register" && !user;
  const isStudentLogin = path === "/student/login" && !user;
  const isAdminLogin = path === "/admin/login" && !user;
  const isStudentDashboard = path === "/student/dashboard" && user?.role === "student";
  const isAdminDashboard = path === "/admin/dashboard" && user?.role === "admin";

  return (
    <>
      <Header user={user} navigate={navigate} onLogout={logout} />
      {path === "/" && !user ? (
        <LandingPage navigate={navigate} />
      ) : isStudentRegister || isStudentLogin || isAdminLogin ? (
        <AuthPage
          role={isAdminLogin ? "admin" : "student"}
          register={isStudentRegister}
          csrfToken={csrfToken}
          canAuthenticate={Boolean(csrfToken)}
          navigate={navigate}
          onAuthenticated={handleAuthenticated}
        />
      ) : (
        <main className="page-shell dashboard-shell">
          {isStudentDashboard && (
            <>
              <div className="dashboard-welcome"><span>Signed in as <strong>{user.name}</strong> · {user.email}</span><span>{user.department}</span></div>
              {pageError && <div className="notice notice-error" role="alert">{pageError}</div>}
              <StudentPortal user={user} complaints={recentFirstComplaints} csrfToken={csrfToken} onCreated={refreshData} notify={setToast} />
            </>
          )}
          {isAdminDashboard && (
            <>
              <div className="dashboard-welcome"><span>Administrator: <strong>{user.name}</strong></span><span>Authorized access</span></div>
              {pageError && <div className="notice notice-error" role="alert">{pageError}</div>}
              <AdminDashboard complaints={recentFirstComplaints} stats={stats} csrfToken={csrfToken} onStatusChange={refreshData} notify={setToast} />
            </>
          )}
          {dataLoading && <p className="loading-note" aria-live="polite">Loading reports…</p>}
        </main>
      )}
      {authLoadError && <div className="notice notice-error auth-load-error" role="alert">{authLoadError}</div>}
      {toast && <div className="toast visible" role="status" aria-live="polite">{toast}</div>}
      <footer className="footer">
        <span>© {new Date().getFullYear()} CampusCare</span>
        <span>Made for a better campus, together <span className="footer-heart">♥</span></span>
      </footer>
    </>
  );
}
