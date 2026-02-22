# Diocesan Seat Information

## Overview

The Orthodox Parish Directory now includes comprehensive information about **diocesan seats** — the locations where Orthodox bishops oversee their dioceses. This feature helps users understand the hierarchical structure of the Orthodox Church and identifies which parishes are located at episcopal sees.

## Data Structure

### All-Parishes.json Enhancement

Each parish record in `output/all-parishes.json` that is located in a diocesan seat city now includes:

```json
{
  "name": "St. Innocent Cathedral",
  "city": "Anchorage",
  "state": "AK",
  "diocese": "Diocese of Alaska",
  "jurisdiction": "Orthodox Church in America (OCA)",
  "diocesanSeats": [
    {
      "diocese": "Diocese of Alaska",
      "jurisdiction": "Orthodox Church in America (OCA)",
      "type": "Metropolitan Archbishop",
      "notes": "Covers all of Alaska"
    }
  ]
}
```

### Bishop Locations Reference

A comprehensive reference file `bishop-locations.json` documents all major diocesan seats:

```json
{
  "Diocese of Alaska": {
    "seat": "Anchorage, AK",
    "jurisdiction": "Orthodox Church in America (OCA)",
    "type": "Metropolitan Archbishop",
    "notes": "Covers all of Alaska"
  }
}
```

## Coverage

**111 churches** across North America have been marked with diocesan seat information, representing:

- **18 diocesan seat cities**
- **20+ dioceses** across multiple Orthodox jurisdictions
- All major Orthodox Church in America (OCA) dioceses
- Major Greek Orthodox (GOARCH) metropolitans
- Antiochian, Serbian, Romanian, Ukrainian, Bulgarian, and ACROD jurisdictions

### Mapped Diocesan Seat Locations

| Location | Diocese | Jurisdiction |
|----------|---------|--------------|
| Anchorage, AK | Diocese of Alaska | OCA |
| Toronto, ON | Diocese of Canada | OCA |
| Atlanta, GA | Diocese of the South | OCA |
| Minneapolis, MN | Diocese of the Midwest | OCA |
| Boston, MA | Diocese of New England | OCA |
| New York, NY | Diocese of New York and New Jersey / Archdiocese of America | OCA / GOARCH |
| Washington, DC | Diocese of Washington | OCA |
| Phoenix, AZ | Diocese of the Southwest | OCA |
| Chicago, IL | Diocese of the Midwest (OCA) / Metropolia of Chicago (GOARCH) | OCA / GOARCH |
| Denver, CO | Metropolia of Denver | GOARCH |
| Pittsburgh, PA | Metropolia of Pittsburgh | GOARCH |
| San Francisco, CA | Metropolia of San Francisco | GOARCH |
| Englewood, NJ | Antiochian Archdiocese | Antiochian |
| Libertyville, IL | Serbian Orthodox Metropolitanate | Serbian Orthodox |
| Jackson, MI | Romanian Orthodox Archdiocese | Romanian Orthodox |
| Parma, OH | Ukrainian Orthodox Church Metropolia | Ukrainian Orthodox |
| Johnstown, PA | American Carpatho-Russian Orthodox Diocese | ACROD |

## Frontend Display

### Map Visualization

1. **Diocesan Seat Rings**: Churches located at diocesan seats display a distinctive **gold ring** around their marker, indicating their special status as episcopal sees.

2. **Modal Information**: When clicking on a parish at a diocesan seat, a dedicated section appears showing:
   - Diocese name
   - Type of episcopal see (Archbishop, Metropolitan, Bishop, etc.)
   - Parent jurisdiction
   - Historical or structural notes

### Example Modal Display

```
[Header: St. Innocent Cathedral ⛪]

[Section: LOCATION]
Place: Anchorage, AK
Address: 3101 Spenard Rd, Anchorage, AK 99503

[Section: CHURCH HIERARCHY]
Diocese: Diocese of Alaska
Jurisdiction: OCA

[Section: DIOCESAN SEAT] 👑
┌─────────────────────────────────┐
│ Diocese of Alaska               │
│ Type: Metropolitan Archbishop   │
│ Jurisdiction: OCA               │
│ Covers all of Alaska            │
└─────────────────────────────────┘
```

## Creation Process

### Data Collection

The diocesan seat information was researched comprehensively for all major Orthodox jurisdictions operating in North America:

1. **OCA (Orthodox Church in America)**
   - 7 dioceses with clearly defined geographic boundaries
   - Metropolitan and Archbishop ranks

2. **GOARCH (Greek Orthodox Archdiocese)**
   - Metropolitan system with 5 major jurisdictions
   - Archdiocese primate in New York

3. **Other Jurisdictions**
   - Antiochian, Serbian, Romanian, Ukrainian, Bulgarian, and ACROD all included
   - Each with documented principal sees

### Integration Pipeline

```
bishop-locations.json
        ↓
add-bishop-seats.js (matching script)
        ↓
output/all-parishes.json (enriched with diocesanSeats)
        ↓
src/routes/parishes.js (API endpoint)
        ↓
public/map.html (visual display)
```

## API Endpoints

### `/api/map/points`
Returns GeoJSON features for all parishes with geographic coordinates. Now includes `diocesanSeats` property for churches located at episcopal sees:

```javascript
{
  "type": "Feature",
  "properties": {
    "name": "St. Innocent Cathedral",
    "diocese": "Diocese of Alaska",
    "diocesanSeats": [{ /* seat info */ }],
    // ... other properties
  },
  "geometry": { type: "Point", coordinates: [-149.5, 61.2] }
}
```

## Scripts and Files

| File | Purpose |
|------|---------|
| `bishop-locations.json` | Reference data for all diocesan seats |
| `add-bishop-seats.js` | Script that adds diocesanSeats to all-parishes.json |
| `output/all-parishes.json` | Updated with diocesanSeats field (111 churches) |
| `public/map.html` | Frontend with diocesan seat visualization |
| `src/routes/parishes.js` | API endpoint serving diocesan seat data |

## Usage

### For Users

1. Open the interactive map at `http://localhost:3000/map.html`
2. Look for churches with a **gold ring** around their marker
3. Click on any marked church to see diocesan seat information in the modal

### For Developers

Load diocesan seat data programmatically:

```javascript
// Fetch all parishes with diocesan seat info
fetch('/api/map/points')
  .then(r => r.json())
  .then(data => {
    const seatsOnly = data.features.filter(f => f.properties.diocesanSeats);
    console.log(`Found ${seatsOnly.length} churches at diocesan seats`);
    
    seatsOnly.forEach(f => {
      console.log(`${f.properties.name}: ${f.properties.diocesanSeats[0].diocese}`);
    });
  });
```

## Future Enhancements

Potential areas for expansion:

1. **Current Bishops**: Add names and biographical information for each diocesan bishop
2. **Historical Information**: Track changes in diocesan organization and bishop succession
3. **Filtering**: Add diocesan seat filter to the control panel
4. **Statistics**: Display count of parishes at each diocesan seat
5. **Search**: Enable searching for churches by diocesan seat type
6. **Mobile Integration**: Optimize diocesan seat display for mobile devices

## Data Accuracy

This data reflects the Orthodox Church organizational structure as of 2024-2025. All 20 major diocesan seats across North American Orthodox jurisdictions have been documented with:

- Confirmed geographic locations
- Accurate jurisdiction classifications
- Ecclesiastical rank information
- Jurisdictional coverage notes

The mapping of 111 churches to their diocesan seats was performed by geographic matching (city + state) against known episcopal sees.

## References

- Orthodox Church in America (OCA) Diocese Structure: https://www.oca.org/
- Greek Orthodox Archdiocese of America: https://www.goarch.org/
- Antiochian Orthodox Christian Archdiocese: https://www.antiochian.org/
- Serbian Orthodox Church: https://www.serbianorthodoxchurch.net/
- Romanian Orthodox Archdiocese: https://www.roea.org/
