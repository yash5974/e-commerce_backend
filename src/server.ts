import cors from "cors";
import express, { Request, Response, urlencoded } from "express";
import helmet from "helmet";
import morgan from "morgan";
import { connectDB } from "./config/db";
import { environment } from "./config/env";
import { globalErrorHandler } from "./middleware/globalError.middleware";
import commonRouter from "./router/common.router";

const app = express();

app.use(helmet());
app.use(cors());
app.use(morgan("combined"));
app.use(express.json());
app.use(urlencoded());

app.use("/", commonRouter);

app.get("/", (req: Request, res: Response) => {
  res.json({ message: "Connected" });
});

app.use(globalErrorHandler);

connectDB();

const port = environment.PORT;
app.listen(port, () => {
  console.log(`Server running on port: ${port}`);
});
