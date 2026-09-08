import { Router, Request, Response } from "express";
import { query } from "../config/db.js";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth.js";
import { haversineMeters } from "../services/geo.js";

export const dvrRouter = Router();

// Require auth on all dvr endpoints
dvrRouter.use(requireAuth);

/** Get active locations for field selection */
dvrRouter.get("/assigned-locations", async (_req: Request, res: Response) => {
  try {
    const result = await query(
      "SELECT * FROM locations WHERE is_active = true ORDER BY name ASC"
    );
    return res.json(result.rows);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to fetch locations" });
  }
});

/** Get office options for dropdown */
dvrRouter.get("/office-options", async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const [allLocs, myRequests] = await Promise.all([
      query("SELECT * FROM locations WHERE is_active = true ORDER BY name ASC"),
      query("SELECT * FROM locations WHERE created_by = $1 ORDER BY created_at DESC LIMIT 30", [authReq.userId]),
    ]);

    return res.json({
      assigned: allLocs.rows,
      active: allLocs.rows,
      myRequests: myRequests.rows,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to fetch office options" });
  }
});

/** Submit a verified DVR visit */
dvrRouter.post("/visits", async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const {
      location_id,
      purpose,
      remarks,
      latitude,
      longitude,
      gps_accuracy,
      photo,
    } = req.body;

    if (!location_id || !purpose || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: "Missing required visit fields." });
    }

    // Check fixed location in PostgreSQL
    const locRes = await query("SELECT * FROM locations WHERE id = $1", [location_id]);
    if (locRes.rows.length === 0) {
      return res.status(404).json({ error: "Location not found." });
    }

    const loc = locRes.rows[0];
    const allowedRadius = loc.radius_meters || 100;
    const distanceMeters = Math.round(
      haversineMeters(loc.latitude, loc.longitude, Number(latitude), Number(longitude)) * 10
    ) / 10;

    const isVerified = distanceMeters <= allowedRadius;

    // Insert visit in PostgreSQL
    const visitRes = await query(
      `INSERT INTO visits (
        employee_id, location_id, purpose, remarks, photo_url,
        latitude, longitude, distance_meters, gps_accuracy_meters, is_verified
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        authReq.userId,
        loc.id,
        purpose,
        remarks || null,
        photo ? String(photo).slice(0, 500) : null, // or store data/path
        Number(latitude),
        Number(longitude),
        distanceMeters,
        gps_accuracy ? Number(gps_accuracy) : null,
        isVerified,
      ]
    );

    return res.status(201).json({
      success: true,
      visit: visitRes.rows[0],
      isVerified,
      distanceMeters,
      allowedRadius,
    });
  } catch (err: any) {
    console.error("Submit visit error:", err);
    return res.status(500).json({ error: err.message || "Failed to submit visit" });
  }
});

/** Get visit history for current employee */
dvrRouter.get("/my-visits", async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const result = await query(
      `SELECT v.*, l.name as location_name, l.address as location_address, p.full_name as employee_name, p.email as employee_email
       FROM visits v
       JOIN locations l ON v.location_id = l.id
       JOIN profiles p ON v.employee_id = p.id
       WHERE v.employee_id = $1
       ORDER BY v.created_at DESC`,
      [authReq.userId]
    );

    return res.json(result.rows);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to fetch visits" });
  }
});

/** Search places via Amazon Location Service (backend only) */
dvrRouter.post("/places/search", async (req: Request, res: Response) => {
  try {
    const { query: rawQuery, biasLat = 26.9124, biasLng = 75.7873 } = req.body;
    if (!rawQuery || typeof rawQuery !== "string") {
      return res.json([]);
    }

    const awsApiKey = process.env.AWS_MAP_API_KEY;
    const awsRegion = process.env.AWS_MAP_REGION || "eu-north-1";
    const qLower = rawQuery.toLowerCase();
    const hasLocationContext = qLower.includes("jaipur") || qLower.includes("rajasthan") || qLower.includes("india");
    const enhancedQuery = hasLocationContext ? rawQuery : `${rawQuery}, Jaipur, Rajasthan`;

    if (awsApiKey) {
      try {
        const url = `https://places.geo.${awsRegion}.amazonaws.com/places/v0/places/search/text?key=${awsApiKey}`;
        const awsRes = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            Text: enhancedQuery,
            FilterCountries: ["IND"],
            BiasPosition: [Number(biasLng), Number(biasLat)],
            MaxResults: 8,
          }),
        });

        if (awsRes.ok) {
          const json = await awsRes.json();
          const results = (json.Results || []).map((r: any) => ({
            label: r.Place?.Label || rawQuery,
            address: r.Place?.AddressNumber || r.Place?.Street
              ? `${r.Place?.AddressNumber ?? ""} ${r.Place?.Street ?? ""}, ${r.Place?.Municipality ?? "Jaipur"}, Rajasthan, India`.trim()
              : r.Place?.Label || rawQuery,
            latitude: r.Place?.Geometry?.Point?.[1] ?? Number(biasLat),
            longitude: r.Place?.Geometry?.Point?.[0] ?? Number(biasLng),
            source: "aws",
          }));
          return res.json(results);
        }
      } catch (awsErr) {
        console.warn("[Backend AWS Place Search Notice]", awsErr);
      }
    }

    // Fallback: Photon geocoder
    try {
      const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(enhancedQuery)}&lat=${biasLat}&lon=${biasLng}&limit=6`;
      const photonRes = await fetch(photonUrl, { headers: { Accept: "application/json" } });
      if (photonRes.ok) {
        const json = await photonRes.json();
        const results = (json.features || []).map((f: any) => {
          const props = f.properties || {};
          const geom = f.geometry || {};
          const fullAddr = [props.name, props.street, props.district || props.city || "Jaipur", props.state || "Rajasthan", props.country || "India"]
            .filter(Boolean)
            .join(", ");
          return {
            label: fullAddr,
            address: fullAddr,
            latitude: geom.coordinates?.[1] ?? Number(biasLat),
            longitude: geom.coordinates?.[0] ?? Number(biasLng),
            source: "osm",
          };
        });
        return res.json(results);
      }
    } catch {}

    return res.json([]);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to search places" });
  }
});

/** Reverse Geocode via Amazon Location Service (backend only) */
dvrRouter.post("/places/reverse-geocode", async (req: Request, res: Response) => {
  try {
    const { latitude, longitude } = req.body;
    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: "Latitude and Longitude are required." });
    }

    const lat = Number(latitude);
    const lng = Number(longitude);
    const awsApiKey = process.env.AWS_MAP_API_KEY;
    const awsRegion = process.env.AWS_MAP_REGION || "eu-north-1";

    if (awsApiKey) {
      try {
        const url = `https://places.geo.${awsRegion}.amazonaws.com/places/v0/places/reverse-geocode?key=${awsApiKey}`;
        const awsRes = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            Position: [lng, lat],
            MaxResults: 1,
            Language: "en",
          }),
        });

        if (awsRes.ok) {
          const json = await awsRes.json();
          const label = json.Results?.[0]?.Place?.Label;
          if (label) {
            return res.json({ address: label, source: "aws" });
          }
        }
      } catch (awsErr) {
        console.warn("[Backend AWS Reverse Geocode Notice]", awsErr);
      }
    }

    // Fallback: BigDataCloud
    try {
      const bdcRes = await fetch(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`
      );
      if (bdcRes.ok) {
        const json = await bdcRes.json();
        const parts = [
          json.localityInfo?.informative?.[0]?.name || json.locality || "",
          json.localityInfo?.administrative?.[3]?.name || json.locality || "",
          json.city || json.localityInfo?.administrative?.[2]?.name || "",
          json.principalSubdivision || "",
          json.postcode || "",
        ].filter(Boolean);
        const unique = Array.from(new Set(parts)).join(", ");
        if (unique) {
          return res.json({ address: unique, source: "bdc" });
        }
      }
    } catch {}

    return res.json({ address: `${lat.toFixed(6)}, ${lng.toFixed(6)}`, source: "coords" });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to reverse geocode" });
  }
});
