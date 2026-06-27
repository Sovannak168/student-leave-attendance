'use client';

import { useEffect, useRef, useState } from 'react';

interface Point {
  lat: number;
  lng: number;
}

interface Geofence {
  id: string;
  name: string;
  polygon_geojson: {
    type: string;
    coordinates: number[][][]; // GeoJSON format: [[[lng, lat], [lng, lat], ...]]
  };
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

interface MapComponentProps {
  mode: 'view' | 'edit';
  geofences: Geofence[];
  students: StudentMarker[];
  onSavePolygon?: (points: Point[]) => void;
  selectedStudentLocation?: Point | null;
}

export default function MapComponent({
  mode,
  geofences,
  students,
  onSavePolygon,
  selectedStudentLocation
}: MapComponentProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<any>(null);
  const geofenceLayers = useRef<any[]>([]);
  const studentMarkers = useRef<{ [id: string]: any }>({});
  const editorPolyline = useRef<any>(null);
  const editorMarkers = useRef<any[]>([]);
  const [editorPoints, setEditorPoints] = useState<Point[]>([]);
  const LRef = useRef<any>(null);

  // Initialize Map
  useEffect(() => {
    if (!mapRef.current || leafletMap.current) return;

    // Load Leaflet dynamically on the client
    import('leaflet').then((L) => {
      LRef.current = L;

      // Fix default marker icon paths in Leaflet
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const map = L.map(mapRef.current!).setView([11.416025, 104.764708], 16);
      leafletMap.current = map;

      // Add Tile Layer (OpenStreetMap dark mode styled or default)
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
      }).addTo(map);

      // Connect editor listener if in edit mode
      map.on('click', handleMapClick);
    });

    return () => {
      if (leafletMap.current) {
        leafletMap.current.off('click');
        leafletMap.current.remove();
        leafletMap.current = null;
      }
    };
  }, []);

  // Sync mode transitions
  useEffect(() => {
    if (mode === 'view') {
      clearEditor();
    }
  }, [mode]);

  // Handle map centering on selected student
  useEffect(() => {
    if (leafletMap.current && selectedStudentLocation) {
      leafletMap.current.setView([selectedStudentLocation.lat, selectedStudentLocation.lng], 16);
    }
  }, [selectedStudentLocation]);

  // Render Geofence Polygons
  useEffect(() => {
    const map = leafletMap.current;
    const L = LRef.current;
    if (!map || !L) return;

    // Clear old geofence layers
    geofenceLayers.current.forEach(layer => map.removeLayer(layer));
    geofenceLayers.current = [];

    // Draw new ones
    geofences.forEach(gf => {
      if (!gf.polygon_geojson || !gf.polygon_geojson.coordinates) return;
      
      // GeoJSON structure is: coords[polygonIndex][pointIndex] where point is [lng, lat]
      const rawCoordinates = gf.polygon_geojson.coordinates[0];
      const leafletLatLngs = rawCoordinates.map(coord => [coord[1], coord[0]]); // Swap to [lat, lng]

      const polygonLayer = L.polygon(leafletLatLngs, {
        color: gf.is_active ? '#10b981' : '#6b7280',
        fillColor: gf.is_active ? '#10b981' : '#6b7280',
        fillOpacity: 0.25,
        weight: 3
      }).addTo(map);

      polygonLayer.bindPopup(`<strong>Geofence:</strong> ${gf.name}<br/>Status: ${gf.is_active ? 'Active' : 'Inactive'}`);
      geofenceLayers.current.push(polygonLayer);
    });

    // If geofences are present and we are initializing, adjust map bounds
    if (geofences.length > 0 && geofenceLayers.current.length > 0) {
      const group = L.featureGroup(geofenceLayers.current);
      map.fitBounds(group.getBounds(), { padding: [30, 30] });
    }
  }, [geofences, LRef.current]);

  // Update Live Student Markers
  useEffect(() => {
    const map = leafletMap.current;
    const L = LRef.current;
    if (!map || !L) return;

    // Track active student IDs in current update
    const activeStudentIds = new Set(students.map(s => s.studentId));

    // Remove disconnected student markers
    Object.keys(studentMarkers.current).forEach(id => {
      if (!activeStudentIds.has(id)) {
        map.removeLayer(studentMarkers.current[id]);
        delete studentMarkers.current[id];
      }
    });

    // Update or create active markers
    students.forEach(student => {
      const { studentId, lat, lng, name, rollNumber, status } = student;

      // Select icon color based on status
      let markerColor = '#22c55e'; // Green for Active
      if (status === 'LEAVE') markerColor = '#eab308'; // Yellow
      if (status === 'OUT_OF_BOUNDS') markerColor = '#ef4444'; // Red

      const pulseClass = status === 'OUT_OF_BOUNDS' ? 'pulsate-dot' : '';

      // Create Custom Div Icon for styling
      const customIcon = L.divIcon({
        className: 'custom-student-marker',
        html: `
          <div class="relative flex items-center justify-center">
            <span class="absolute inline-flex h-6 w-6 rounded-full opacity-75 animate-ping" style="background-color: ${markerColor}"></span>
            <span class="relative inline-flex rounded-full h-3 w-3" style="background-color: ${markerColor}"></span>
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });

      if (studentMarkers.current[studentId]) {
        // Update coordinates and icon
        studentMarkers.current[studentId].setLatLng([lat, lng]);
        studentMarkers.current[studentId].setIcon(customIcon);
        studentMarkers.current[studentId].setPopupContent(`
          <strong>${name}</strong> (${rollNumber})<br/>
          Status: <span style="color: ${markerColor}">${status}</span><br/>
          Location: ${lat.toFixed(5)}, ${lng.toFixed(5)}
        `);
      } else {
        // Create new marker
        const marker = L.marker([lat, lng], { icon: customIcon })
          .addTo(map)
          .bindPopup(`
            <strong>${name}</strong> (${rollNumber})<br/>
            Status: <span style="color: ${markerColor}">${status}</span><br/>
            Location: ${lat.toFixed(5)}, ${lng.toFixed(5)}
          `);
        studentMarkers.current[studentId] = marker;
      }
    });
  }, [students, LRef.current]);

  // Handle map clicks in Edit Mode to draw polygon vertices
  const handleMapClick = (e: any) => {
    if (mode !== 'edit') return;
    const L = LRef.current;
    const map = leafletMap.current;
    if (!L || !map) return;

    const newPoint: Point = { lat: e.latlng.lat, lng: e.latlng.lng };
    
    // Add point to array
    setEditorPoints(prev => {
      const updated = [...prev, newPoint];

      // Update Polyline
      const latlngs = updated.map(p => [p.lat, p.lng]);
      if (editorPolyline.current) {
        editorPolyline.current.setLatLngs(latlngs);
      } else {
        editorPolyline.current = L.polyline(latlngs, { color: '#6366f1', weight: 3 }).addTo(map);
      }

      // Add vertex point marker
      const vertexMarker = L.circleMarker([newPoint.lat, newPoint.lng], {
        radius: 5,
        color: '#4f46e5',
        fillColor: '#6366f1',
        fillOpacity: 1
      }).addTo(map);

      editorMarkers.current.push(vertexMarker);

      return updated;
    });
  };

  const clearEditor = () => {
    const map = leafletMap.current;
    if (!map) return;

    if (editorPolyline.current) {
      map.removeLayer(editorPolyline.current);
      editorPolyline.current = null;
    }

    editorMarkers.current.forEach(marker => map.removeLayer(marker));
    editorMarkers.current = [];
    setEditorPoints([]);
  };

  const handleSave = () => {
    if (editorPoints.length < 3) {
      alert('A geofence polygon requires at least 3 points.');
      return;
    }
    if (onSavePolygon) {
      onSavePolygon(editorPoints);
    }
    clearEditor();
  };

  return (
    <div className="relative w-full h-full rounded-2xl overflow-hidden glass-panel">
      <div ref={mapRef} className="w-full h-full min-h-[500px] z-0" />
      
      {/* Editor Controls Overlay */}
      {mode === 'edit' && (
        <div className="absolute top-4 right-4 z-[1000] flex gap-2 bg-card p-3 rounded-xl border border-border shadow-lg">
          <div className="text-xs text-gray-400 flex items-center mr-2">
            Points placed: {editorPoints.length} (Min: 3)
          </div>
          <button
            onClick={clearEditor}
            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold rounded-lg transition"
          >
            Clear
          </button>
          <button
            onClick={handleSave}
            className="px-3 py-1.5 bg-primary hover:bg-primary-hover text-white text-xs font-semibold rounded-lg transition shadow-md shadow-primary/20"
          >
            Save Geofence
          </button>
        </div>
      )}
    </div>
  );
}
