export default function AuthButton({ user, onOpenLogin, onLogout, variant = 'light' }) {
  const isDark = variant === 'dark';

  if (user) {
    const initial = (user.name || user.email || 'U').charAt(0).toUpperCase();
    return (
      <div className="flex items-center gap-2">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '4px 10px 4px 5px',
            borderRadius: 999,
            border: isDark ? '1.5px solid #495057' : '1.5px solid #e9dfc8',
            background: isDark ? '#343a40' : '#fffef7',
            color: isDark ? '#f8f9fa' : '#212529',
            boxShadow: isDark ? 'none' : '2px 2px 0 #e9dfc8',
          }}
        >
          {user.avatar ? (
            <img
              src={user.avatar}
              alt={user.name}
              style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover' }}
            />
          ) : (
            <span
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: '#f08c00',
                color: '#fff',
                fontSize: 12,
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {initial}
            </span>
          )}
          <span style={{ fontSize: 13, fontWeight: 600, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user.name}
          </span>
        </div>
        <button
          id="logout-btn"
          onClick={onLogout}
          style={{
            fontFamily: "'Caveat', cursive",
            fontSize: 15,
            fontWeight: 700,
            padding: '4px 12px',
            borderRadius: 8,
            border: isDark ? '1.5px solid #495057' : '1.5px solid #e9dfc8',
            background: 'transparent',
            color: isDark ? '#adb5bd' : '#495057',
            cursor: 'pointer',
          }}
          className="hover:opacity-80 transition"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <button
      id="open-login-btn"
      onClick={onOpenLogin}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        fontFamily: "'Caveat', cursive",
        fontSize: 17,
        fontWeight: 700,
        padding: isDark ? '5px 14px' : '7px 16px',
        borderRadius: 10,
        border: isDark ? '1.5px solid #f08c00' : '2px solid #212529',
        background: isDark ? '#f08c00' : '#fffef7',
        color: isDark ? '#fff' : '#212529',
        boxShadow: isDark ? '2px 2px 0 #000' : '3px 3px 0 #212529',
        cursor: 'pointer',
        transition: 'transform 0.12s ease, box-shadow 0.12s ease',
      }}
      onMouseDown={(e) => {
        e.currentTarget.style.transform = 'translate(1px, 1px)';
      }}
      onMouseUp={(e) => {
        e.currentTarget.style.transform = '';
      }}
    >
      <span>Sign in</span>
    </button>
  );
}
