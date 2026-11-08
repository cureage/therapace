import { createSlice, PayloadAction } from '@reduxjs/toolkit';

type User = {
  id: string;
  email: string;
  name: string;
};

type UserState = {
  currentUser: User | null;
  authToken: string | null;
  isAuthenticated: boolean;
  isOnboarding: boolean;
};

const initialState: UserState = {
  currentUser: null,
  authToken: null,
  isAuthenticated: false,
  isOnboarding: false,
};

const userSlice = createSlice({
  name: 'user',
  initialState,
  reducers: {
    setUser(state, action: PayloadAction<{ user: User; token: string }>) {
      state.currentUser = action.payload.user;
      state.authToken = action.payload.token;
      state.isAuthenticated = true;
    },
    logout(state) {
      state.currentUser = null;
      state.authToken = null;
      state.isAuthenticated = false;
    },
  },
});

export const { setUser, logout } = userSlice.actions;
export default userSlice.reducer;
