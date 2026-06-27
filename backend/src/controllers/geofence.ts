import { Request, Response } from 'express';
import { query } from '../db';

// Helper to convert an array of {lat, lng} to PostGIS WKT POLYGON
// WKT expects longitude first (X), latitude second (Y)
// Example format: POLYGON((lng1 lat1, lng2 lat2, ..., lng1 lat1))
function pointsToWktPolygon(points: { lat: number; lng: number }[]): string {
  if (points.length < 3) {
    throw new Error('A polygon must have at least 3 points.');
  }

  const formattedPoints = points.map(p => `${p.lng} ${p.lat}`);
  
  // PostGIS requires the polygon loop to be closed (first and last coordinate must be identical)
  const firstPoint = formattedPoints[0];
  const lastPoint = formattedPoints[formattedPoints.length - 1];
  if (firstPoint !== lastPoint) {
    formattedPoints.push(firstPoint);
  }

  return `POLYGON((${formattedPoints.join(', ')}))`;
}

// CREATE GEOFENCE
export const createGeofence = async (req: Request, res: Response) => {
  const { name, points } = req.body;
  const creatorId = req.user?.id;

  if (!name || !points || !Array.isArray(points)) {
    return res.status(400).json({ error: 'Name and points array are required' });
  }

  try {
    const wktPolygon = pointsToWktPolygon(points);

    const result = await query(
      `INSERT INTO geofences (name, polygon, created_by) 
       VALUES ($1, ST_GeomFromText($2, 4326), $3) 
       RETURNING id, name, ST_AsGeoJSON(polygon) as polygon_geojson, is_active, created_at`,
      [name, wktPolygon, creatorId]
    );

    const geofence = result.rows[0];
    geofence.polygon_geojson = JSON.parse(geofence.polygon_geojson);

    return res.status(201).json({
      message: 'Geofence created successfully',
      geofence
    });
  } catch (error: any) {
    console.error('[Create Geofence Error]', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error during geofence creation' });
  }
};

// LIST GEOFENCES
export const listGeofences = async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT id, name, ST_AsGeoJSON(polygon) as polygon_geojson, is_active, created_at 
       FROM geofences 
       ORDER BY created_at DESC`
    );

    const geofences = result.rows.map(row => ({
      ...row,
      polygon_geojson: JSON.parse(row.polygon_geojson)
    }));

    return res.json({ geofences });
  } catch (error) {
    console.error('[List Geofences Error]', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

// GET GEOFENCE BY ID
export const getGeofenceById = async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const result = await query(
      `SELECT id, name, ST_AsGeoJSON(polygon) as polygon_geojson, is_active, created_at 
       FROM geofences 
       WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Geofence not found' });
    }

    const geofence = result.rows[0];
    geofence.polygon_geojson = JSON.parse(geofence.polygon_geojson);

    return res.json({ geofence });
  } catch (error) {
    console.error('[Get Geofence Error]', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

// UPDATE GEOFENCE
export const updateGeofence = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, points, isActive } = req.body;

  try {
    let updateFields: string[] = [];
    let queryParams: any[] = [id];
    let counter = 2;

    if (name !== undefined) {
      updateFields.push(`name = $${counter++}`);
      queryParams.push(name);
    }

    if (isActive !== undefined) {
      updateFields.push(`is_active = $${counter++}`);
      queryParams.push(isActive);
    }

    if (points !== undefined && Array.isArray(points)) {
      const wktPolygon = pointsToWktPolygon(points);
      updateFields.push(`polygon = ST_GeomFromText($${counter++}, 4326)`);
      queryParams.push(wktPolygon);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields provided to update' });
    }

    updateFields.push(`updated_at = NOW()`);

    const queryText = `
      UPDATE geofences 
      SET ${updateFields.join(', ')} 
      WHERE id = $1 
      RETURNING id, name, ST_AsGeoJSON(polygon) as polygon_geojson, is_active, updated_at`;

    const result = await query(queryText, queryParams);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Geofence not found' });
    }

    const updatedGeofence = result.rows[0];
    updatedGeofence.polygon_geojson = JSON.parse(updatedGeofence.polygon_geojson);

    return res.json({
      message: 'Geofence updated successfully',
      geofence: updatedGeofence
    });
  } catch (error: any) {
    console.error('[Update Geofence Error]', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error during geofence update' });
  }
};

// DELETE GEOFENCE
export const deleteGeofence = async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const result = await query('DELETE FROM geofences WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Geofence not found' });
    }

    return res.json({ message: 'Geofence deleted successfully' });
  } catch (error) {
    console.error('[Delete Geofence Error]', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
