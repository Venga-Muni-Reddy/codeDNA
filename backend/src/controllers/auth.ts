import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import { User } from '../models/User';
import { AppError } from '../utils/errors';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '../utils/jwt';

export const register = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { name, email, password } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw new AppError('Email address already in use', 400);
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const newUser = new User({
      name,
      email,
      passwordHash,
    });

    await newUser.save();

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: newUser,
      },
      errors: null,
      meta: {},
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      throw new AppError('Invalid email or password', 400);
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      throw new AppError('Invalid email or password', 400);
    }

    const payload = { userId: user._id.toString(), role: user.role };
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    // Save refresh token to user model
    user.refreshTokens.push(refreshToken);
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user,
        accessToken,
        refreshToken,
      },
      errors: null,
      meta: {},
    });
  } catch (error) {
    next(error);
  }
};

export const logout = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { refreshToken } = req.body;

    const decoded = verifyRefreshToken(refreshToken);
    const user = await User.findById(decoded.userId);
    if (user) {
      user.refreshTokens = user.refreshTokens.filter((token) => token !== refreshToken);
      await user.save();
    }

    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
      data: {},
      errors: null,
      meta: {},
    });
  } catch (error) {
    next(error);
  }
};

export const refresh = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { refreshToken } = req.body;

    const decoded = verifyRefreshToken(refreshToken);
    const user = await User.findById(decoded.userId);

    if (!user || !user.refreshTokens.includes(refreshToken)) {
      throw new AppError('Invalid refresh token or session expired', 401);
    }

    // Issue new tokens
    const payload = { userId: user._id.toString(), role: user.role };
    const newAccessToken = generateAccessToken(payload);
    const newRefreshToken = generateRefreshToken(payload);

    // Swap old refresh token for new one
    user.refreshTokens = user.refreshTokens.filter((token) => token !== refreshToken);
    user.refreshTokens.push(newRefreshToken);
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Tokens refreshed successfully',
      data: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      },
      errors: null,
      meta: {},
    });
  } catch (error) {
    next(new AppError('Unauthorized refresh request', 401));
  }
};
