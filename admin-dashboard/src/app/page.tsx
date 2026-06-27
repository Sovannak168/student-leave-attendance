'use client';

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { 
  ShieldAlert, 
  MapPin, 
  Settings, 
  Layers, 
  FileCheck, 
  History, 
  UserCheck, 
  LogOut, 
  Play, 
  AlertTriangle, 
  Plus, 
  Check, 
  X, 
  RefreshCw,
  Bell
} from 'lucide-react';
import { io, Socket } from 'socket.io-client';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000';

// Dynamically load Leaflet Map Component with SSR disabled
const MapComponent = dynamic(() => import('../components/MapComponent'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[500px] flex items-center justify-center bg-card rounded-2xl border border-border">
      <div className="flex flex-col items-center gap-3">
        <RefreshCw className="h-8 w-8 text-primary animate-spin" />
        <span className="text-gray-400 text-sm">Loading map tiles...</span>
      </div>
    </div>
  )
});

interface Geofence {
  id: string;
  name: string;
  polygon_geojson: any;
  is_active: boolean;
}

interface StudentMarker {
  studentId: string;
  name: string;
  rollNumber: string;
  lat: number;
  lng: number;
  status: 'ACTIVE' | 'LEAVE' | 'OUT_OF_BOUNDS';
}

interface LeaveRequest {
  id: string;
  student_email: string;
  roll_number: string;
  class_name: string;
  reason: string;
  exit_time: string;
  return_time: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  approved_by_email?: string;
  created_at: string;
}

interface ExitLog {
  id: string;
  student_email: string;
  roll_number: string;
  class_name: string;
  guard_email: string;
  log_type: 'EXIT' | 'ENTRY';
  logged_at: string;
  leave_reason?: string;
}

interface LiveAlert {
  id: string;
  studentId: string;
  name: string;
  rollNumber: string;
  alertMessage: string;
  timestamp: string;
}

export default function Home() {
  // Authentication State
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // App Layout State
  const [activeTab, setActiveTab] = useState<'tracking' | 'geofences' | 'leaves' | 'logs' | 'simulator'>('tracking');
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [liveStudents, setLiveStudents] = useState<{ [id: string]: StudentMarker }>({});
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [logs, setLogs] = useState<ExitLog[]>([]);
  const [alerts, setAlerts] = useState<LiveAlert[]>([]);
  const [selectedStudentLoc, setSelectedStudentLoc] = useState<{ lat: number; lng: number } | null>(null);
  
  // Geofence Creator State
  const [newGeofenceName, setNewGeofenceName] = useState('');
  const [isEditingGeofence, setIsEditingGeofence] = useState(false);

  // Student GPS Simulator Panel State
  const [simEmail, setSimEmail] = useState('student1@gmail.com');
  const [simPassword, setSimPassword] = useState('password123');
  const [simRoll, setSimRoll] = useState('STD-001');
  const [simClass, setSimClass] = useState('Year 4 CS');
  const [simDeviceUuid, setSimDeviceUuid] = useState('33333333-3333-3333-3333-333333333333');
  const [simToken, setSimToken] = useState<string | null>(null);
  const [simStatus, setSimStatus] = useState<'DISCONNECTED' | 'CONNECTED'>('DISCONNECTED');
  const [simLatitude, setSimLatitude] = useState(11.416025);
  const [simLongitude, setSimLongitude] = useState(104.764708);
  const [simLogMsg, setSimLogMsg] = useState<string[]>([]);

  const adminSocket = useRef<Socket | null>(null);
  const studentSocket = useRef<Socket | null>(null);

  // Load token on mount
  useEffect(() => {
    const savedToken = localStorage.getItem('admin_token');
    if (savedToken) {
      setToken(savedToken);
    }
  }, []);

  // Connect to Admin WebSockets and load data when authenticated
  useEffect(() => {
    if (!token) return;

    fetchData();

    // Setup Admin Socket connection
    const socket = io(SOCKET_URL, {
      auth: { token }
    });

    adminSocket.current = socket;

    socket.on('connect', () => {
      console.log('[Socket] Admin connected.');
    });

    // Listen for live student location updates
    socket.on('student_location', (data: StudentMarker) => {
      setLiveStudents(prev => ({
        ...prev,
        [data.studentId]: data
      }));
    });

    // Listen for real-time out-of-bounds alerts
    socket.on('geofence_alert', (alert: any) => {
      const newAlert: LiveAlert = {
        id: Math.random().toString(36).substring(7),
        studentId: alert.studentId,
        name: alert.name,
        rollNumber: alert.rollNumber,
        alertMessage: alert.alertMessage,
        timestamp: new Date(alert.timestamp).toLocaleTimeString()
      };
      setAlerts(prev => [newAlert, ...prev]);
    });

    return () => {
      socket.disconnect();
      adminSocket.current = null;
    };
  }, [token]);

  const fetchData = async () => {
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      
      const [geofenceRes, leavesRes, logsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/geofences`, { headers }),
        fetch(`${API_BASE_URL}/permissions`, { headers }),
        fetch(`${API_BASE_URL}/exit-logs`, { headers })
      ]);

      if (geofenceRes.ok) {
        const data = await geofenceRes.json();
        setGeofences(data.geofences);
      }
      if (leavesRes.ok) {
        const data = await leavesRes.json();
        setLeaves(data.permissions);
      }
      if (logsRes.ok) {
        const data = await logsRes.json();
        setLogs(data.exitLogs);
      }
    } catch (err) {
      console.error('[FetchData Error]', err);
    }
  };

  // ADMIN LOGIN
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      if (data.user.role !== 'ADMIN') {
        throw new Error('Access Denied: This dashboard is for Admins only.');
      }

      localStorage.setItem('admin_token', data.token);
      setToken(data.token);
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    setToken(null);
    setLiveStudents({});
    setAlerts([]);
  };

  // LEAVE APPROVALS
  const handleDecideLeave = async (id: string, decision: 'APPROVED' | 'REJECTED') => {
    try {
      const res = await fetch(`${API_BASE_URL}/permissions/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: decision })
      });

      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      console.error('[Decide Leave Error]', err);
    }
  };

  // CREATE NEW GEOFENCE
  const handleSaveGeofence = async (points: { lat: number; lng: number }[]) => {
    if (!newGeofenceName.trim()) {
      alert('Please enter a name for the new geofence.');
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/geofences`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: newGeofenceName,
          points
        })
      });

      if (res.ok) {
        setNewGeofenceName('');
        setIsEditingGeofence(false);
        fetchData();
        alert('Geofence created successfully.');
      } else {
        const data = await res.json();
        alert(`Failed: ${data.error}`);
      }
    } catch (err) {
      console.error('[Save Geofence Error]', err);
    }
  };

  // SIMULATOR ACTIONS
  const handleSimRegister = async () => {
    setSimLogMsg(prev => [...prev, 'Registering simulation student...']);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: simEmail,
          password: simPassword,
          role: 'STUDENT',
          rollNumber: simRoll,
          className: simClass,
          deviceUuid: simDeviceUuid
        })
      });
      const data = await res.json();
      if (res.ok) {
        setSimLogMsg(prev => [...prev, 'Student registered! Logging in...']);
        handleSimLogin();
      } else {
        setSimLogMsg(prev => [...prev, `Registration failed: ${data.error}`]);
      }
    } catch (error: any) {
      setSimLogMsg(prev => [...prev, `Error: ${error.message}`]);
    }
  };

  const handleSimLogin = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: simEmail,
          password: simPassword,
          deviceUuid: simDeviceUuid
        })
      });
      const data = await res.json();
      if (res.ok) {
        setSimToken(data.token);
        setSimLogMsg(prev => [...prev, 'Student login successful. Connecting WebSocket...']);
        
        // Connect student WebSocket
        const socket = io(SOCKET_URL, {
          auth: { 
            token: data.token,
            deviceUuid: simDeviceUuid
          }
        });

        studentSocket.current = socket;

        socket.on('connect', () => {
          setSimStatus('CONNECTED');
          setSimLogMsg(prev => [...prev, 'WebSocket Connected! Ready to stream coordinates.']);
        });

        socket.on('student_geofence_warning', (warning: any) => {
          setSimLogMsg(prev => [...prev, `[WARNING RECEIVED]: ${warning.message}`]);
        });

        socket.on('error_message', (err: any) => {
          setSimLogMsg(prev => [...prev, `[SOCKET ERROR]: ${err.message}`]);
        });

        socket.on('disconnect', () => {
          setSimStatus('DISCONNECTED');
          setSimLogMsg(prev => [...prev, 'WebSocket Disconnected.']);
        });
      } else {
        setSimLogMsg(prev => [...prev, `Login failed: ${data.error}`]);
      }
    } catch (error: any) {
      setSimLogMsg(prev => [...prev, `Error: ${error.message}`]);
    }
  };

  const handleSimDisconnect = () => {
    if (studentSocket.current) {
      studentSocket.current.disconnect();
      studentSocket.current = null;
    }
    setSimToken(null);
    setSimStatus('DISCONNECTED');
    setSimLogMsg(prev => [...prev, 'Simulator disconnected manually.']);
  };

  const handleSimSendCoords = (lat: number, lng: number) => {
    if (!studentSocket.current) {
      alert('Connect student client first!');
      return;
    }
    setSimLatitude(lat);
    setSimLongitude(lng);
    studentSocket.current.emit('location_update', { lat, lng });
    setSimLogMsg(prev => [...prev, `Emitted Location: ${lat.toFixed(5)}, ${lng.toFixed(5)}`]);
  };

  return (
    <main className="min-h-screen flex flex-col bg-background text-gray-100">
      
      {/* 1. AUTH SCREEN */}
      {!token ? (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-md p-8 rounded-2xl glass-panel hover-card relative overflow-hidden">
            {/* Top Indigo Glow Accent */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500" />
            
            <div className="flex flex-col items-center mb-8">
              <div className="h-12 w-12 bg-primary/20 rounded-xl flex items-center justify-center border border-primary/30 mb-3 animate-glow">
                <ShieldAlert className="h-6 w-6 text-primary" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">Geofence Portal</h1>
              <p className="text-gray-400 text-sm mt-1">Admin Centralized Dashboard</p>
            </div>

            {authError && (
              <div className="mb-5 p-3.5 bg-danger/10 border border-danger/30 text-danger text-xs font-semibold rounded-lg flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="admin@school.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full bg-[#1b1f28] border border-border focus:border-primary focus:ring-1 focus:ring-primary rounded-xl px-4 py-3 text-sm transition outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">Password</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full bg-[#1b1f28] border border-border focus:border-primary focus:ring-1 focus:ring-primary rounded-xl px-4 py-3 text-sm transition outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full mt-2 bg-primary hover:bg-primary-hover active:bg-primary-hover/90 text-white font-semibold py-3 px-4 rounded-xl transition shadow-lg shadow-primary/20 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isLoading ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <span>Access Dashboard</span>
                )}
              </button>
            </form>
          </div>
        </div>
      ) : (
        
        // 2. MAIN CONSOLE INTERFACE
        <div className="flex-1 flex flex-col md:flex-row">
          
          {/* SIDE NAVIGATION PANEL */}
          <aside className="w-full md:w-64 bg-card border-r border-border p-6 flex flex-col gap-6">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 bg-primary/20 rounded-lg flex items-center justify-center border border-primary/30">
                <ShieldAlert className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-sm font-bold leading-none">Guard-Geo</h2>
                <span className="text-[10px] text-gray-400">Admin Control Console</span>
              </div>
            </div>

            <nav className="flex flex-col gap-1.5 flex-1">
              <button
                onClick={() => setActiveTab('tracking')}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition ${
                  activeTab === 'tracking' ? 'bg-primary text-white shadow-md shadow-primary/20' : 'text-gray-400 hover:bg-[#1b1f28] hover:text-gray-200'
                }`}
              >
                <MapPin className="h-4 w-4" />
                <span>Live Tracking</span>
              </button>

              <button
                onClick={() => setActiveTab('geofences')}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition ${
                  activeTab === 'geofences' ? 'bg-primary text-white shadow-md shadow-primary/20' : 'text-gray-400 hover:bg-[#1b1f28] hover:text-gray-200'
                }`}
              >
                <Layers className="h-4 w-4" />
                <span>Geofence Editor</span>
              </button>

              <button
                onClick={() => setActiveTab('leaves')}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition ${
                  activeTab === 'leaves' ? 'bg-primary text-white shadow-md shadow-primary/20' : 'text-gray-400 hover:bg-[#1b1f28] hover:text-gray-200'
                }`}
              >
                <FileCheck className="h-4 w-4" />
                <span>Leave Approvals</span>
                {leaves.filter(l => l.status === 'PENDING').length > 0 && (
                  <span className="ml-auto bg-danger text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded-full">
                    {leaves.filter(l => l.status === 'PENDING').length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('logs')}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition ${
                  activeTab === 'logs' ? 'bg-primary text-white shadow-md shadow-primary/20' : 'text-gray-400 hover:bg-[#1b1f28] hover:text-gray-200'
                }`}
              >
                <History className="h-4 w-4" />
                <span>Guard Logs</span>
              </button>

              <div className="border-t border-border/60 my-4" />

              <button
                onClick={() => setActiveTab('simulator')}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold border border-indigo-500/20 transition ${
                  activeTab === 'simulator' ? 'bg-indigo-600/20 text-indigo-400 border-indigo-500/40' : 'text-indigo-400/70 hover:bg-indigo-950/20'
                }`}
              >
                <Play className="h-4 w-4" />
                <span>GPS Simulator</span>
              </button>
            </nav>

            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold text-danger hover:bg-danger/10 transition mt-auto"
            >
              <LogOut className="h-4 w-4" />
              <span>Log Out</span>
            </button>
          </aside>

          {/* MAIN CONTAINER TABS */}
          <section className="flex-1 p-6 md:p-8 flex flex-col gap-6 overflow-y-auto max-h-screen">
            
            {/* REAL-TIME BREATHE ALARMS CONSOLE */}
            {alerts.length > 0 && (
              <div className="bg-danger/10 border border-danger/30 p-4 rounded-2xl flex flex-col gap-3 relative overflow-hidden animate-pulseFast shadow-lg shadow-danger/5">
                <div className="flex items-center gap-2">
                  <Bell className="h-5 w-5 text-danger animate-bounce" />
                  <h3 className="font-bold text-danger text-sm tracking-wide uppercase">Real-Time Geofence Breaches</h3>
                  <button 
                    onClick={() => setAlerts([])} 
                    className="ml-auto p-1 text-gray-400 hover:text-gray-200 transition"
                    title="Clear All Alerts"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="max-h-24 overflow-y-auto space-y-2 pr-2">
                  {alerts.slice(0, 3).map(alert => (
                    <div key={alert.id} className="text-xs flex items-center justify-between bg-black/30 px-3 py-2 rounded-lg">
                      <span>{alert.alertMessage}</span>
                      <span className="text-gray-400 text-[10px] shrink-0 ml-4">{alert.timestamp}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 1: LIVE MAP TRACKING */}
            {activeTab === 'tracking' && (
              <div className="flex-1 flex flex-col lg:flex-row gap-6 min-h-0">
                <div className="flex-1 flex flex-col gap-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <h1 className="text-xl font-extrabold">Live Student Tracker</h1>
                      <p className="text-xs text-gray-400">Streamed GPS points from student mobile devices</p>
                    </div>
                    <button 
                      onClick={fetchData} 
                      className="p-2 bg-card border border-border hover:bg-gray-800 rounded-xl transition"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="flex-1 min-h-[500px]">
                    <MapComponent
                      mode="view"
                      geofences={geofences}
                      students={Object.values(liveStudents)}
                      selectedStudentLocation={selectedStudentLoc}
                    />
                  </div>
                </div>

                {/* Tracking Directory */}
                <div className="w-full lg:w-80 bg-card border border-border rounded-2xl p-5 flex flex-col gap-4">
                  <h3 className="font-bold text-sm">Students Directory</h3>
                  
                  <div className="flex-1 overflow-y-auto space-y-2.5 max-h-[500px] pr-1.5">
                    {Object.values(liveStudents).length === 0 ? (
                      <div className="text-center text-xs text-gray-500 py-8">
                        No active student broadcasts. Use the GPS Simulator tab to test.
                      </div>
                    ) : (
                      Object.values(liveStudents).map(student => (
                        <div
                          key={student.studentId}
                          onClick={() => setSelectedStudentLoc({ lat: student.lat, lng: student.lng })}
                          className="p-3 bg-[#1b1f28] hover:bg-[#232936] border border-border rounded-xl cursor-pointer transition flex items-center justify-between"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-bold truncate leading-tight">{student.name}</p>
                            <span className="text-[10px] text-gray-400">Roll: {student.rollNumber}</span>
                          </div>
                          
                          <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full shrink-0 ${
                            student.status === 'ACTIVE' ? 'bg-success/10 text-success border border-success/20' :
                            student.status === 'LEAVE' ? 'bg-warning/10 text-warning border border-warning/20' :
                            'bg-danger/10 text-danger border border-danger/20'
                          }`}>
                            {student.status}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: GEOFENCE EDITOR */}
            {activeTab === 'geofences' && (
              <div className="flex-1 flex flex-col gap-4">
                <div>
                  <h1 className="text-xl font-extrabold">Geofence Boundary Editor</h1>
                  <p className="text-xs text-gray-400">Define administrative permitted parameters</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                  {/* Left Controls */}
                  <div className="lg:col-span-1 bg-card border border-border p-5 rounded-2xl flex flex-col gap-4 h-fit">
                    <h3 className="font-bold text-sm">Draw New Geofence</h3>
                    
                    {!isEditingGeofence ? (
                      <button
                        onClick={() => setIsEditingGeofence(true)}
                        className="w-full py-2.5 bg-primary hover:bg-primary-hover text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition"
                      >
                        <Plus className="h-4 w-4" />
                        <span>Start Drawing</span>
                      </button>
                    ) : (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-[10px] font-semibold text-gray-400 mb-1">GEOFENCE NAME</label>
                          <input
                            type="text"
                            placeholder="e.g. Science Block"
                            value={newGeofenceName}
                            onChange={e => setNewGeofenceName(e.target.value)}
                            className="w-full bg-[#1b1f28] border border-border rounded-xl px-3 py-2 text-xs transition outline-none"
                          />
                        </div>
                        <div className="text-[10px] text-gray-400 leading-normal bg-black/20 p-3 rounded-lg">
                          Click vertex coordinates on the map. You must place at least 3 vertices, then click <strong>Save Geofence</strong>.
                        </div>
                        <button
                          onClick={() => {
                            setIsEditingGeofence(false);
                            setNewGeofenceName('');
                          }}
                          className="w-full py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold rounded-xl transition"
                        >
                          Cancel Drawing
                        </button>
                      </div>
                    )}

                    <div className="border-t border-border/60 my-2" />

                    <h3 className="font-bold text-xs">Saved Geofences</h3>
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                      {geofences.length === 0 ? (
                        <div className="text-[10px] text-gray-500 py-3 text-center">No geofences stored.</div>
                      ) : (
                        geofences.map(gf => (
                          <div key={gf.id} className="p-2.5 bg-[#1b1f28] border border-border rounded-xl flex items-center justify-between text-xs">
                            <span className="font-medium truncate mr-2">{gf.name}</span>
                            <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${gf.is_active ? 'bg-success/20 text-success' : 'bg-gray-800 text-gray-400'}`}>
                              {gf.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Right Map */}
                  <div className="lg:col-span-3 min-h-[500px]">
                    <MapComponent
                      mode={isEditingGeofence ? 'edit' : 'view'}
                      geofences={geofences}
                      students={[]}
                      onSavePolygon={handleSaveGeofence}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: LEAVE APPROVALS */}
            {activeTab === 'leaves' && (
              <div className="flex-1 flex flex-col gap-4">
                <div>
                  <h1 className="text-xl font-extrabold">Leave Permissions Board</h1>
                  <p className="text-xs text-gray-400">Review student requests and approve dynamic scanning passes</p>
                </div>

                <div className="bg-card border border-border rounded-2xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-border bg-black/20 text-gray-400 uppercase tracking-wider text-[10px] font-semibold">
                          <th className="p-4">Student</th>
                          <th className="p-4">Roll / Class</th>
                          <th className="p-4">Reason</th>
                          <th className="p-4">Leave Interval</th>
                          <th className="p-4">Status</th>
                          <th className="p-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leaves.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="p-8 text-center text-gray-500">No leave requests found.</td>
                          </tr>
                        ) : (
                          leaves.map(req => (
                            <tr key={req.id} className="border-b border-border/50 hover:bg-black/10 transition">
                              <td className="p-4 font-semibold">{req.student_email.split('@')[0]}</td>
                              <td className="p-4 text-gray-400">{req.roll_number} / {req.class_name}</td>
                              <td className="p-4 italic">{req.reason}</td>
                              <td className="p-4 text-gray-400">
                                {new Date(req.exit_time).toLocaleString()}<br/>
                                <span className="text-[10px] text-gray-500">to {new Date(req.return_time).toLocaleString()}</span>
                              </td>
                              <td className="p-4">
                                <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full ${
                                  req.status === 'PENDING' ? 'bg-warning/20 text-warning' :
                                  req.status === 'APPROVED' ? 'bg-success/20 text-success' :
                                  'bg-danger/20 text-danger'
                                }`}>
                                  {req.status}
                                </span>
                              </td>
                              <td className="p-4 text-right">
                                {req.status === 'PENDING' ? (
                                  <div className="flex gap-1.5 justify-end">
                                    <button
                                      onClick={() => handleDecideLeave(req.id, 'APPROVED')}
                                      className="p-1.5 bg-success/20 hover:bg-success text-success hover:text-white rounded-lg transition"
                                      title="Approve Request"
                                    >
                                      <Check className="h-4.5 w-4.5" />
                                    </button>
                                    <button
                                      onClick={() => handleDecideLeave(req.id, 'REJECTED')}
                                      className="p-1.5 bg-danger/20 hover:bg-danger text-danger hover:text-white rounded-lg transition"
                                      title="Reject Request"
                                    >
                                      <X className="h-4.5 w-4.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-gray-500 font-medium">
                                    {req.status === 'APPROVED' ? `Approved by ${req.approved_by_email?.split('@')[0]}` : 'Rejected'}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: PHYSICAL GUARD LOGS */}
            {activeTab === 'logs' && (
              <div className="flex-1 flex flex-col gap-4">
                <div>
                  <h1 className="text-xl font-extrabold">Entry & Exit Audits</h1>
                  <p className="text-xs text-gray-400">Scanned QR records registered at physical gates by Guards</p>
                </div>

                <div className="bg-card border border-border rounded-2xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-border bg-black/20 text-gray-400 uppercase tracking-wider text-[10px] font-semibold">
                          <th className="p-4">Student</th>
                          <th className="p-4">Roll / Class</th>
                          <th className="p-4">Gate Event</th>
                          <th className="p-4">Logged At</th>
                          <th className="p-4">Guard Account</th>
                          <th className="p-4">Leave Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {logs.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="p-8 text-center text-gray-500">No scanning events logged yet.</td>
                          </tr>
                        ) : (
                          logs.map(log => (
                            <tr key={log.id} className="border-b border-border/50 hover:bg-black/10 transition">
                              <td className="p-4 font-semibold">{log.student_email.split('@')[0]}</td>
                              <td className="p-4 text-gray-400">{log.roll_number} / {log.class_name}</td>
                              <td className="p-4">
                                <span className={`px-2 py-0.5 text-[9px] font-bold rounded-md ${
                                  log.log_type === 'EXIT' ? 'bg-danger/25 text-danger border border-danger/10' : 'bg-success/25 text-success border border-success/10'
                                }`}>
                                  {log.log_type === 'EXIT' ? 'PHYSICAL EXIT' : 'PHYSICAL ENTRY'}
                                </span>
                              </td>
                              <td className="p-4 text-gray-400">{new Date(log.logged_at).toLocaleString()}</td>
                              <td className="p-4 text-gray-400">{log.guard_email.split('@')[0]}</td>
                              <td className="p-4 italic text-gray-500">{log.leave_reason || 'N/A'}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 5: STUDENT GPS SIMULATOR (CRITICAL FOR TESTING SYSTEM) */}
            {activeTab === 'simulator' && (
              <div className="flex-1 flex flex-col gap-4">
                <div>
                  <h1 className="text-xl font-extrabold">Interactive Student GPS Simulator</h1>
                  <p className="text-xs text-gray-400">Simulate a student mobile device coordinates inside or outside geofences without physical hardware.</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Left settings */}
                  <div className="bg-card border border-border p-6 rounded-2xl space-y-4">
                    <h3 className="font-bold text-sm">Simulator Config</h3>
                    
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="block text-gray-400 mb-1">Student Email</label>
                        <input
                          type="email"
                          value={simEmail}
                          onChange={e => setSimEmail(e.target.value)}
                          className="w-full bg-[#1b1f28] border border-border rounded-xl px-3 py-2 text-xs transition outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-gray-400 mb-1">Password</label>
                        <input
                          type="password"
                          value={simPassword}
                          onChange={e => setSimPassword(e.target.value)}
                          className="w-full bg-[#1b1f28] border border-border rounded-xl px-3 py-2 text-xs transition outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-gray-400 mb-1">Roll Number</label>
                        <input
                          type="text"
                          value={simRoll}
                          onChange={e => setSimRoll(e.target.value)}
                          className="w-full bg-[#1b1f28] border border-border rounded-xl px-3 py-2 text-xs transition outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-gray-400 mb-1">Class/Grade</label>
                        <input
                          type="text"
                          value={simClass}
                          onChange={e => setSimClass(e.target.value)}
                          className="w-full bg-[#1b1f28] border border-border rounded-xl px-3 py-2 text-xs transition outline-none"
                        />
                      </div>
                    </div>

                    <div className="flex gap-2.5">
                      {simStatus === 'DISCONNECTED' ? (
                        <>
                          <button
                            onClick={handleSimRegister}
                            className="flex-1 py-2 bg-indigo-600/20 border border-indigo-500/30 hover:bg-indigo-600/30 text-indigo-400 font-bold text-xs rounded-xl transition"
                          >
                            Register & Connect
                          </button>
                          <button
                            onClick={handleSimLogin}
                            className="flex-1 py-2 bg-primary hover:bg-primary-hover text-white font-bold text-xs rounded-xl transition"
                          >
                            Login & Connect
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={handleSimDisconnect}
                          className="w-full py-2 bg-danger hover:bg-danger-hover text-white font-bold text-xs rounded-xl transition"
                        >
                          Disconnect Simulation Client
                        </button>
                      )}
                    </div>

                    <div className="border-t border-border/60 my-2" />

                    <h3 className="font-bold text-xs">GPS Streaming Controls</h3>
                    
                    <div className="grid grid-cols-2 gap-3 text-xs leading-normal">
                      <button
                        onClick={() => handleSimSendCoords(11.5621, 104.9202)} // Center Phnom Penh
                        disabled={simStatus === 'DISCONNECTED'}
                        className="p-3 bg-success/15 border border-success/30 hover:bg-success/25 text-success font-semibold rounded-xl text-center disabled:opacity-40 transition"
                      >
                        📍 Emit Coordinates Inside Geofence
                        <div className="text-[9px] text-gray-400 font-normal mt-1">(11.5621, 104.9202)</div>
                      </button>
                      
                      <button
                        onClick={() => handleSimSendCoords(11.6000, 104.8500)} // Far out
                        disabled={simStatus === 'DISCONNECTED'}
                        className="p-3 bg-danger/15 border border-danger/30 hover:bg-danger/25 text-danger font-semibold rounded-xl text-center disabled:opacity-40 transition"
                      >
                        🚨 Emit Coordinates Outside Geofence
                        <div className="text-[9px] text-gray-400 font-normal mt-1">(11.6000, 104.8500)</div>
                      </button>
                    </div>
                  </div>

                  {/* Right Logs */}
                  <div className="bg-card border border-border p-6 rounded-2xl flex flex-col h-[380px]">
                    <div className="flex items-center gap-2 mb-3">
                      <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${simStatus === 'CONNECTED' ? 'bg-success animate-ping' : 'bg-gray-600'}`} />
                      <h3 className="font-bold text-sm">Simulator Status: {simStatus}</h3>
                    </div>
                    <div className="flex-1 bg-black/30 border border-border rounded-xl p-4 font-mono text-[10px] overflow-y-auto space-y-1.5 text-gray-300">
                      {simLogMsg.map((msg, i) => (
                        <div key={i}>{msg}</div>
                      ))}
                      {simLogMsg.length === 0 && <div className="text-gray-500">No activity yet.</div>}
                    </div>
                  </div>
                </div>
              </div>
            )}

          </section>

        </div>
      )}

    </main>
  );
}
