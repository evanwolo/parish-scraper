# User Authentication & Profile Features

## Overview

The Orthodox Parish Directory now includes a comprehensive user authentication and profile management system. Users can create accounts, manage their parish connections, and track their spiritual journey.

## Features

### 1. User Authentication
- **Registration**: Create a new account with email and password
- **Login**: Secure login with password hashing (bcrypt)
- **Session Management**: Persistent sessions using express-session
- **Logout**: Secure logout functionality

### 2. User Profile Management
Users can maintain a detailed profile including:
- **Home Address**: Store your residential address (used to find closest parishes)
- **Church Status**: Track your status in the church:
  - Inquirer
  - Catechumen
  - Baptized Orthodox
  - Chrismated
  - Clergy
- **Baptismal Parish**: Record where you were baptized
- **Current Parish**: Track your current home parish

### 3. Closest Parish Finder
- Automatically calculates the closest Orthodox parish to your home address
- Uses the Haversine formula for accurate distance calculations
- Shows distance in miles along with parish details
- Updates when you change your home address

### 4. Parish Visit Tracking
- Record every Orthodox parish you've visited
- Add personal notes about your visits
- View visit history with dates
- Remove visits from your list
- Search through all parishes to add visits

## Getting Started

### For Users

1. **Create an Account**
   - Navigate to `/auth.html` or click "Login" in the header
   - Switch to the "Register" tab
   - Enter your email and create a password (minimum 6 characters)
   - Click "Create Account"

2. **Set Up Your Profile**
   - After registration, you'll be redirected to your profile page
   - Add your home address (this enables the closest parish feature)
   - Select your status in the church
   - Search and select your baptismal parish (if applicable)
   - Search and select your current parish
   - Click "Save Profile"

3. **Find Your Closest Parish**
   - Once your home address is saved, the "Closest Parish" card will show the nearest Orthodox parish
   - Click "Refresh Closest Parish" to recalculate after address changes

4. **Track Parish Visits**
   - Use the search box in the "Parishes I've Visited" section
   - Type to search for any parish in the directory
   - Click on a parish to add it to your visits
   - Remove visits by clicking the "Remove" button

### For Developers

#### Installation

The following packages were added:
```bash
npm install bcrypt express-session cookie-parser
```

#### Database Schema

Three new tables were added:

**users**
- `id`: Primary key
- `email`: Unique email address
- `password`: Bcrypt hashed password
- `created_at`: Account creation timestamp
- `updated_at`: Last update timestamp

**user_profiles**
- `id`: Primary key
- `user_id`: Foreign key to users table
- `home_address`: User's residential address (text)
- `home_lat`: Latitude of home address
- `home_lng`: Longitude of home address
- `church_status`: Status in the church (inquirer, catechumen, etc.)
- `baptismal_parish_id`: Foreign key to parishes table
- `current_parish_id`: Foreign key to parishes table

**user_parish_visits**
- `id`: Primary key
- `user_id`: Foreign key to users table
- `parish_id`: Foreign key to parishes table
- `visited_at`: Timestamp of visit record
- `notes`: Optional notes about the visit

#### API Endpoints

##### Authentication
- `POST /api/auth/register` - Register a new user
  - Body: `{ email, password }`
  - Returns: `{ success, userId, email }`

- `POST /api/auth/login` - Login
  - Body: `{ email, password }`
  - Returns: `{ success, userId, email }`

- `POST /api/auth/logout` - Logout
  - Returns: `{ success }`

- `GET /api/auth/me` - Get current user
  - Returns: `{ userId, email }`

##### Profile Management
- `GET /api/user/profile` - Get user profile (requires auth)
  - Returns: Full profile with parish details

- `PUT /api/user/profile` - Update user profile (requires auth)
  - Body: `{ home_address, home_lat, home_lng, church_status, baptismal_parish_id, current_parish_id }`
  - Returns: `{ success }`

##### Parish Visits
- `GET /api/user/visits` - Get all parish visits (requires auth)
  - Returns: Array of visits with parish details

- `POST /api/user/visits` - Add a parish visit (requires auth)
  - Body: `{ parish_id, notes? }`
  - Returns: `{ success }`

- `DELETE /api/user/visits/:id` - Remove a parish visit (requires auth)
  - Returns: `{ success }`

##### Closest Parish
- `GET /api/user/closest-parish` - Get 10 closest parishes (requires auth)
  - Returns: Array of parishes with distance in miles

#### Security Features

1. **Password Hashing**: All passwords are hashed using bcrypt with 10 salt rounds
2. **Session Management**: Sessions use secure cookies (httpOnly, secure in production)
3. **Authentication Middleware**: Protected routes require valid session
4. **Foreign Key Constraints**: Database maintains referential integrity
5. **Input Validation**: Email and password requirements enforced

#### Geocoding

The profile page includes client-side geocoding using OpenStreetMap's Nominatim service. When a user enters their home address:
1. Address is geocoded to latitude/longitude
2. Coordinates are stored in the database
3. Closest parish calculation uses these coordinates

**Note**: For production use, consider using a more robust geocoding service like:
- Google Maps Geocoding API
- Mapbox Geocoding API
- HERE Geocoding API

#### Session Configuration

Sessions are configured with:
- Secret key (should be set via `SESSION_SECRET` environment variable in production)
- 30-day expiration
- Secure cookies in production
- HttpOnly flag for XSS protection

#### Frontend Pages

**auth.html**
- Clean, modern authentication interface
- Tab-based switching between login and registration
- Client-side validation
- Error and success message handling
- Auto-redirect to profile after successful auth

**profile.html**
- Comprehensive profile management
- Parish search with autocomplete
- Real-time closest parish display
- Visit history with add/remove functionality
- Responsive design

## Environment Variables

For production deployment, set:

```bash
SESSION_SECRET=your-secret-key-here
NODE_ENV=production
```

## Security Recommendations

1. **Change the default session secret** in production
2. **Use HTTPS** to ensure secure cookie transmission
3. **Implement rate limiting** on authentication endpoints
4. **Add email verification** for new accounts
5. **Implement password reset** functionality
6. **Add CSRF protection** for state-changing operations
7. **Monitor for suspicious login patterns**

## Future Enhancements

Potential features to add:
- Password reset via email
- Email verification
- Profile pictures
- Parish reviews/ratings
- Social features (friend connections)
- Prayer request sharing
- Event attendance tracking
- Push notifications for nearby services
- Mobile app integration
- OAuth login (Google, Facebook)

## Testing

To test the authentication system:

1. Start the server: `npm start`
2. Navigate to `http://localhost:3000/auth.html`
3. Create a test account
4. Add profile information
5. Test parish search and visit tracking
6. Verify closest parish calculation
7. Test logout and re-login

## Troubleshooting

**Issue**: "Database not found" error
- **Solution**: Run `npm run compute` to initialize the database

**Issue**: Cannot login after registration
- **Solution**: Check browser console for errors, ensure cookies are enabled

**Issue**: Closest parish not showing
- **Solution**: Ensure home address is saved and geocoded successfully

**Issue**: Parish search not working
- **Solution**: Ensure `/api/parishes` endpoint is accessible and returning data

## License

This feature is part of the Orthodox Parish Directory project and follows the same license.
